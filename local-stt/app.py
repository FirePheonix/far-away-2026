"""
local-stt  –  lightweight background speech-to-text (PyQt6 Edition)

Ctrl+Shift+Space  →  start recording
Ctrl+Shift+Space  →  stop  →  transcribe  →  clipboard
"""

import math
import platform
import random
import socket
import sys
import threading
import time
from typing import Optional

from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QObject, QRectF
from PyQt6.QtGui import QPainter, QColor, QFont, QIcon, QAction, QPixmap
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QTextEdit, QFrame, QSystemTrayIcon, QMenu
)
import numpy as np
import pyperclip
import soundcard as sc
import sounddevice as sd
from pynput import keyboard as pynput_kb
from faster_whisper import WhisperModel

import assistant_client

SYS = platform.system()

_BG       = "#0E0F0F"
_BORDER   = "#2A2A2A"
_TEXT     = "#E8DCC8"
_SUBTEXT  = "#8A8A8A"
_ACCENT   = "#1BB9CE"
_RED      = "#B87878"
_GREEN    = "#7DA888"
_CARD_W   = 640
_CARD_H   = 78
_CARD_H_R = 290


def _make_qicon(size=64, color="#1BB9CE") -> QIcon:
    px = QPixmap(size, size)
    px.fill(Qt.GlobalColor.transparent)
    p = QPainter(px)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.setPen(Qt.PenStyle.NoPen)
    p.setBrush(QColor(color))
    s = float(size)
    p.drawRoundedRect(QRectF(s * 0.30, s * 0.04, s * 0.40, s * 0.54), s * 0.18, s * 0.18)
    p.drawRect(int(s * 0.46), int(s * 0.74), int(s * 0.08), int(s * 0.14))
    p.drawRoundedRect(QRectF(s * 0.30, s * 0.86, s * 0.40, s * 0.08), s * 0.04, s * 0.04)
    p.end()
    return QIcon(px)


def _trunc(s: str, n: int) -> str:
    return s if len(s) <= n else s[:n - 1] + "…"


def _build_interval_table(chunks: list, record_start_time: float) -> tuple[np.ndarray, list]:
    """
    Given a list of (wall_clock_start_ts, audio_data) chunks, return:
      - concatenated audio (float32, mono)
      - interval table: list of (comp_start_s, comp_end_s, real_offset_s)
        where real_offset_s = seconds since record_start_time

    For mic: chunks are gapless so real_offset ≈ comp_start, but we still
    build the table the same way for consistency.
    For loopback: WASAPI drops silence so real_offset != comp_start.
    In both cases Whisper's segment timestamps (in compressed audio time) get
    remapped to wall-clock offsets via this table.
    """
    data_list = []
    intervals = []
    compressed_samples = 0

    for ts, data in chunks:
        if data.ndim > 1:
            data = np.mean(data, axis=1)
        data = data.flatten().astype(np.float32)

        chunk_len = len(data)
        chunk_dur = chunk_len / 16000.0
        real_offset = ts - record_start_time   # ts is chunk START time
        comp_start  = compressed_samples / 16000.0
        comp_end    = comp_start + chunk_dur

        intervals.append((comp_start, comp_end, real_offset))
        data_list.append(data)
        compressed_samples += chunk_len

    audio = np.concatenate(data_list) if data_list else np.array([], dtype=np.float32)
    return audio, intervals


def _map_to_real(compressed_time: float, intervals: list) -> float:
    """Map a compressed-audio timestamp to a wall-clock offset."""
    for comp_start, comp_end, real_offset in intervals:
        if comp_start <= compressed_time < comp_end:
            return real_offset + (compressed_time - comp_start)
    if intervals:
        comp_start, _, real_offset = intervals[-1]
        return real_offset + (compressed_time - comp_start)
    return compressed_time


# ──────────────────────────────────────────────────────────────────────────────

class AudioVisualizer(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(44, 36)
        self.mode = "hidden"
        self.rms = 0.0
        self.phase = 0.0
        self.color = QColor(_ACCENT)

    def set_mode(self, mode: str, color: str):
        self.mode = mode
        self.color = QColor(color)
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(self.color)
        if self.mode == "hidden":
            return
        for i in range(5):
            x = 2 + i * 8
            if self.mode == "listening":
                rms_val = min(1.0, self.rms * 6.0)
                p = max(0.0, min(1.0, rms_val + (i - 2) * 0.08 + random.uniform(-0.04, 0.04)))
                h = int(6 + p * 26)
            elif self.mode == "processing":
                t = math.sin(self.phase + i * 0.8) * 0.5 + 0.5
                h = int(6 + t * 18)
            else:
                h = 6
            y = (36 - h) // 2
            painter.drawRect(x, y, 5, h)


class TranscriptionSignals(QObject):
    result_ready = pyqtSignal(str, bool)
    assistant_ready = pyqtSignal(str, bool)
    assistant_toast = pyqtSignal(str, str, bool)


class FloatingOverlay(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.WindowStaysOnTopHint |
            Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowOpacity(0.0)
        self._state = "hidden"
        self._fade_target = 0.0
        self.anim_timer = QTimer(self)
        self.anim_timer.timeout.connect(self._tick_animation)
        self.anim_timer.start(60)
        self.fade_timer = QTimer(self)
        self.fade_timer.timeout.connect(self._tick_fade)
        self._build_ui()
        self._position(_CARD_H)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        self.outer_frame = QFrame(self)
        self.outer_frame.setStyleSheet(f"QFrame {{ background-color: {_BORDER}; border-radius: 18px; }}")
        outer_layout = QVBoxLayout(self.outer_frame)
        outer_layout.setContentsMargins(1, 1, 1, 1)
        inner_frame = QFrame(self.outer_frame)
        inner_frame.setStyleSheet(f"QFrame {{ background-color: {_BG}; border-radius: 17px; }}")
        self.inner_layout = QVBoxLayout(inner_frame)
        self.inner_layout.setContentsMargins(20, 16, 20, 16)
        top_layout = QHBoxLayout()
        self.icon_lbl = QLabel("✦", inner_frame)
        self.icon_lbl.setFont(QFont("Segoe UI", 22))
        self.icon_lbl.setStyleSheet(f"color: {_ACCENT};")
        top_layout.addWidget(self.icon_lbl)
        self.status_lbl = QLabel("", inner_frame)
        self.status_lbl.setFont(QFont("Segoe UI", 11))
        self.status_lbl.setStyleSheet(f"color: {_TEXT};")
        top_layout.addWidget(self.status_lbl, stretch=1)
        self.visualizer = AudioVisualizer(inner_frame)
        top_layout.addWidget(self.visualizer)
        self.inner_layout.addLayout(top_layout)
        self.res_widget = QWidget(inner_frame)
        res_layout = QVBoxLayout(self.res_widget)
        res_layout.setContentsMargins(0, 10, 0, 0)
        divider = QFrame(self.res_widget)
        divider.setFrameShape(QFrame.Shape.HLine)
        divider.setStyleSheet(f"background-color: {_BORDER}; max-height: 1px; border: none;")
        res_layout.addWidget(divider)
        self.heard_lbl = QLabel("", self.res_widget)
        self.heard_lbl.setFont(QFont("Segoe UI", 9))
        self.heard_lbl.setStyleSheet(f"color: {_SUBTEXT};")
        self.heard_lbl.setWordWrap(True)
        res_layout.addWidget(self.heard_lbl)
        self.result_box = QTextEdit(self.res_widget)
        self.result_box.setFixedHeight(110)
        self.result_box.setReadOnly(True)
        self.result_box.setStyleSheet(f"""
            QTextEdit {{
                background-color: #161717;
                border: 1px solid {_BORDER};
                border-radius: 10px;
                color: {_TEXT};
                font-family: 'Segoe UI';
                font-size: 13px;
                padding: 6px;
            }}
        """)
        res_layout.addWidget(self.result_box)
        footer_lbl = QLabel("copied to clipboard  ·  Esc to close", self.res_widget)
        footer_lbl.setFont(QFont("Segoe UI", 8))
        footer_lbl.setStyleSheet(f"color: {_SUBTEXT};")
        footer_lbl.setAlignment(Qt.AlignmentFlag.AlignRight)
        res_layout.addWidget(footer_lbl)
        self.inner_layout.addWidget(self.res_widget)
        self.res_widget.hide()
        outer_layout.addWidget(inner_frame)
        layout.addWidget(self.outer_frame)

    def _position(self, h: int):
        screen = QApplication.primaryScreen().geometry()
        x = (screen.width() - _CARD_W) // 2
        self.setGeometry(x, 70, _CARD_W, h)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Escape:
            self.dismiss()
        super().keyPressEvent(event)

    def set_rms(self, v: float):
        self.visualizer.rms = v

    def show_listening(self):
        self._state = "listening"
        self.res_widget.hide()
        self._position(_CARD_H)
        self.icon_lbl.setStyleSheet(f"color: {_RED};")
        self.status_lbl.setText("Listening  ·  press again to stop")
        self.status_lbl.setStyleSheet(f"color: {_TEXT};")
        self.visualizer.set_mode("listening", _RED)
        self.show()
        self._fade_to(0.95)

    def show_processing(self):
        self._state = "processing"
        self.res_widget.hide()
        self._position(_CARD_H)
        self.icon_lbl.setStyleSheet(f"color: {_ACCENT};")
        self.status_lbl.setText("Transcribing...")
        self.status_lbl.setStyleSheet(f"color: {_SUBTEXT};")
        self.visualizer.set_mode("processing", _ACCENT)
        self.visualizer.phase = 0.0
        self.show()
        self._fade_to(0.95)

    def show_result(self, text: str, ok: bool = True):
        self._state = "result"
        color = _GREEN if ok else _RED
        self.icon_lbl.setStyleSheet(f"color: {color};")
        self.status_lbl.setText("Done" if ok else "Nothing heard")
        self.status_lbl.setStyleSheet(f"color: {color};")
        self.visualizer.set_mode("flat", _SUBTEXT)
        self.heard_lbl.setText('Heard: "Dialogue Script Generated"' if text else "")
        self.result_box.setPlainText(text)
        self.res_widget.show()
        self._position(_CARD_H_R)

    def show_assistant_toast(self, title: str, message: str, ok: bool = True):
        self._state = "result"
        color = _GREEN if ok else _RED
        self.icon_lbl.setStyleSheet(f"color: {color};")
        self.status_lbl.setText(title)
        self.status_lbl.setStyleSheet(f"color: {color};")
        self.visualizer.set_mode("flat", _SUBTEXT)
        self.heard_lbl.setText("Clawvio assistant")
        self.result_box.setPlainText(message)
        self.res_widget.show()
        self._position(_CARD_H_R)
        self.show()
        self._fade_to(0.95)

    def dismiss(self):
        if self._state == "hidden":
            return
        self._state = "hidden"
        self._fade_to(0.0)

    def _fade_to(self, target: float):
        self._fade_target = target
        self.fade_timer.start(16)

    def _tick_fade(self):
        cur = self.windowOpacity()
        diff = self._fade_target - cur
        step = 0.09
        if abs(diff) < step:
            self.setWindowOpacity(self._fade_target)
            self.fade_timer.stop()
            if self._fade_target == 0.0:
                self.hide()
        else:
            self.setWindowOpacity(cur + (step if diff > 0 else -step))

    def _tick_animation(self):
        if self._state == "listening":
            self.visualizer.update()
        elif self._state == "processing":
            self.visualizer.phase += 0.15
            self.visualizer.update()


# ──────────────────────────────────────────────────────────────────────────────

class LocalSTT(QObject):
    _HOTKEY = {"ctrl", "shift", "space"}

    def __init__(self):
        super().__init__()
        self.overlay = FloatingOverlay()

        self._recording = False
        self._user_stream: Optional[sd.InputStream] = None
        self._loopback_recorder = None
        self._loopback_thread: Optional[threading.Thread] = None
        self._loopback_stop = threading.Event()

        self._user_chunks: list = []   # (wall_clock_chunk_start_ts, np.ndarray)
        self._other_chunks: list = []  # (wall_clock_chunk_start_ts, np.ndarray)
        self._lock = threading.Lock()

        self._model: Optional[WhisperModel] = None
        self._model_ready = threading.Event()

        self.signals = TranscriptionSignals()
        self.signals.result_ready.connect(self._handle_result_ready)
        self.signals.assistant_ready.connect(self._handle_assistant_ready)
        self.signals.assistant_toast.connect(self._handle_assistant_toast)

        self._pressed: set[str] = set()
        self._hotkey_fired = False

        self._build_tray()
        self._start_hotkey_listener()
        threading.Thread(target=self._load_model, daemon=True).start()
        if assistant_client.is_enabled() and not assistant_client.saved_desktop_token():
            threading.Thread(target=self._pair_assistant, daemon=True).start()

    def _get_loopback_device(self):
        try:
            spk = sc.default_speaker()
            loopback = sc.get_microphone(id=str(spk.name), include_loopback=True)
            print(f"[local-stt] loopback: {loopback.name}")
            return loopback
        except Exception as e:
            print(f"[WARN] loopback unavailable: {e}")
            return None

    def _load_model(self):
        print("[local-stt] loading model…")
        self._model = WhisperModel("small", device="cpu", compute_type="int8")
        self._model_ready.set()
        print("[local-stt] model ready")
        self._tray_update_tooltip("local-stt  ·  ready")

    def _build_tray(self):
        self.tray = QSystemTrayIcon(_make_qicon(), self.overlay)
        self.tray.setToolTip("local-stt  ·  loading…")
        menu = QMenu()
        a = QAction("local-stt", menu); a.setEnabled(False); menu.addAction(a)
        menu.addSeparator()
        b = QAction("Ctrl+Shift+Space to record", menu); b.setEnabled(False); menu.addAction(b)
        menu.addSeparator()
        connect = QAction("Connect Clawvio", menu); connect.triggered.connect(self._connect_assistant); menu.addAction(connect)
        logout = QAction("Disconnect Clawvio", menu); logout.triggered.connect(self._logout_assistant); menu.addAction(logout)
        menu.addSeparator()
        q = QAction("Quit", menu); q.triggered.connect(self._quit); menu.addAction(q)
        self.tray.setContextMenu(menu)
        self.tray.show()

    def _tray_update_tooltip(self, msg: str):
        self.tray.setToolTip(msg)

    def _pair_assistant(self):
        try:
            self.signals.assistant_ready.emit("Opening browser to connect Clawvio desktop.", True)
            assistant_client.ensure_paired()
            self.signals.assistant_ready.emit("Clawvio desktop connected.", True)
        except Exception as e:
            print(f"[local-stt] desktop pairing error: {e}")
            self.signals.assistant_ready.emit(f"Desktop pairing failed: {e}", False)

    def _connect_assistant(self):
        threading.Thread(target=self._pair_assistant, daemon=True).start()

    def _logout_assistant(self):
        def _run():
            try:
                assistant_client.logout()
                self.signals.assistant_ready.emit("Clawvio desktop disconnected.", True)
                self._tray_update_tooltip("local-stt  Â·  disconnected")
            except Exception as e:
                print(f"[local-stt] logout error: {e}")
                self.signals.assistant_ready.emit(f"Logout failed: {e}", False)

        threading.Thread(target=_run, daemon=True).start()

    def _start_hotkey_listener(self):
        def _tag(key):
            if key in (pynput_kb.Key.ctrl_l, pynput_kb.Key.ctrl_r, pynput_kb.Key.ctrl): return "ctrl"
            if key in (pynput_kb.Key.shift, pynput_kb.Key.shift_l, pynput_kb.Key.shift_r): return "shift"
            if key == pynput_kb.Key.space: return "space"
            return None

        def on_press(key):
            tag = _tag(key)
            if tag: self._pressed.add(tag)
            if self._pressed >= self._HOTKEY and not self._hotkey_fired:
                self._hotkey_fired = True
                QTimer.singleShot(0, self._toggle)

        def on_release(key):
            tag = _tag(key)
            if tag:
                self._pressed.discard(tag)
                if tag == "space": self._hotkey_fired = False

        listener = pynput_kb.Listener(on_press=on_press, on_release=on_release)
        listener.daemon = True
        listener.start()

    def _toggle(self):
        with self._lock:
            if not self._recording:
                self._begin_recording()
            else:
                self._end_recording()

    def _begin_recording(self):
        self._recording = True
        self._record_start_time = time.monotonic()
        self._user_chunks = []
        self._other_chunks = []
        self.overlay.show_listening()
        self._tray_update_tooltip("local-stt  ·  recording…")

        # Mic callback: store chunk START time before the data arrives
        # (time.monotonic() here is close enough; blocksize/16000 ≈ 64ms jitter max)
        def _user_cb(indata, frames, time_info, status):
            if self._recording:
                # Chunk start = now - chunk_duration
                chunk_dur = frames / 16000.0
                ts = time.monotonic() - chunk_dur
                self._user_chunks.append((ts, indata.copy()))
            self.overlay.set_rms(float(np.sqrt(np.mean(indata.astype(np.float32) ** 2))))

        self._user_stream = sd.InputStream(
            samplerate=16000, channels=1, dtype=np.float32,
            blocksize=1024, callback=_user_cb
        )
        self._user_stream.start()

        loopback_dev = self._get_loopback_device()
        if loopback_dev is not None:
            self._loopback_stop.clear()
            try:
                self._loopback_recorder = loopback_dev.recorder(samplerate=16000, channels=1)
                self._loopback_recorder.__enter__()
                self._loopback_thread = threading.Thread(
                    target=self._loopback_capture_loop, daemon=True
                )
                self._loopback_thread.start()
            except Exception as e:
                print(f"[WARN] loopback start failed: {e}")
                self._loopback_recorder = None
        else:
            print("[WARN] no loopback device")

    def _loopback_capture_loop(self):
        """
        Record loopback in 1024-frame chunks.
        ts stored = wall-clock time when the chunk STARTED.

        WASAPI delivers buffered data in bursts (no silence gaps in the data).
        When chunks arrive faster than real-time we advance ts synthetically
        so it tracks the audio timeline instead of wall-clock burst time.
        On first chunk or after silence we anchor to wall clock.
        """
        chunk_dur = 1024 / 16000.0
        silence_threshold = chunk_dur * 3
        last_ts = None

        try:
            while not self._loopback_stop.is_set():
                data = self._loopback_recorder.record(numframes=1024)
                now = time.monotonic()

                if last_ts is not None and (now - last_ts) < silence_threshold:
                    ts = last_ts + chunk_dur   # synthetic: preserve audio timeline
                else:
                    ts = now - chunk_dur       # anchor: real wall clock, chunk start

                last_ts = ts

                if self._recording:
                    self._other_chunks.append((ts, data.copy()))

        except Exception as e:
            if not self._loopback_stop.is_set():
                print(f"[WARN] loopback error: {e}")

    def _end_recording(self):
        self._recording = False

        if self._user_stream:
            self._user_stream.stop()
            self._user_stream.close()
            self._user_stream = None

        self._loopback_stop.set()
        if self._loopback_recorder:
            try: self._loopback_recorder.__exit__(None, None, None)
            except Exception: pass
            self._loopback_recorder = None
        if self._loopback_thread:
            self._loopback_thread.join(timeout=2)
            self._loopback_thread = None

        user_snapshot  = self._user_chunks[:]
        other_snapshot = self._other_chunks[:]
        record_start   = self._record_start_time

        self._user_chunks = []
        self._other_chunks = []
        self.overlay.show_processing()
        self._tray_update_tooltip("local-stt  ·  transcribing…")
        threading.Thread(
            target=self._transcribe,
            args=(user_snapshot, other_snapshot, record_start),
            daemon=True
        ).start()

    def _transcribe(self, user_chunks: list, other_chunks: list, record_start: float):
        try:
            if not self._model_ready.wait(timeout=30):
                self.signals.result_ready.emit("Model not ready – try again", False)
                return

            timeline_events = []

            for speaker, chunks in (("user", user_chunks), ("other", other_chunks)):
                if not chunks:
                    continue

                audio, intervals = _build_interval_table(chunks, record_start)

                if len(audio) < 4800:
                    continue

                segments, _ = self._model.transcribe(
                    audio,
                    beam_size=1,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=500),
                    word_timestamps=True
                )

                # Word-level splitting: even when the VAD merges two
                # utterances into one segment (e.g. mic picks up faint
                # echo of the other speaker), the per-word timestamps
                # still reveal the real gap.  We split on any gap ≥ 1.5s.
                GAP_THRESHOLD = 1.5

                for seg in segments:
                    if not seg.words:
                        # Fallback: no word data, use segment-level ts
                        real_start = _map_to_real(seg.start, intervals)
                        timeline_events.append({
                            "start": real_start,
                            "speaker": speaker,
                            "text": seg.text.strip()
                        })
                        continue

                    groups: list[list] = [[seg.words[0]]]
                    for w in seg.words[1:]:
                        if (w.start - groups[-1][-1].end) >= GAP_THRESHOLD:
                            groups.append([w])
                        else:
                            groups[-1].append(w)

                    for grp in groups:
                        text = "".join(w.word for w in grp).strip()
                        if text:
                            real_start = _map_to_real(grp[0].start, intervals)
                            timeline_events.append({
                                "start": real_start,
                                "speaker": speaker,
                                "text": text
                            })

            if not timeline_events:
                self.signals.result_ready.emit("", False)
                return

            timeline_events.sort(key=lambda e: e["start"])

            lines = [f'  "{e["speaker"]}" : "{e["text"]}"' for e in timeline_events]
            output = "{\n" + ",\n".join(lines) + "\n}"
            self.signals.result_ready.emit(output, True)

        except Exception as e:
            import traceback; traceback.print_exc()
            self.signals.result_ready.emit(f"Error: {e}", False)

    def _handle_result_ready(self, text: str, ok: bool):
        if ok and text:
            text = assistant_client.normalize_spoken_email(text)
            pyperclip.copy(text)
            print(f"[local-stt] copied:\n{text}")

            if assistant_client.is_enabled():
                def _send():
                    try:
                        print("[local-stt] sending to backend...")
                        res = assistant_client.send_transcript(text, async_mode=True)
                        print(f"[local-stt] backend response: {assistant_client.format_result_summary(res)}")
                        request_id = res.get("requestId")
                        self.signals.assistant_toast.emit(
                            "Clawvio is working",
                            "Your request is queued. I’ll update this bar when it finishes.",
                            True,
                        )
                        if request_id:
                            final = assistant_client.wait_for_completion(request_id)
                            run = final.get("run") or {}
                            request = final.get("request") or {}
                            finished = request.get("status") == "completed"
                            ok_final = finished and run.get("success") is not False
                            title, msg = assistant_client.format_completion_toast(final)
                            self.signals.assistant_toast.emit(title, msg, ok_final)
                    except Exception as e:
                        print(f"[local-stt] backend error: {e}")
                        self.signals.assistant_toast.emit("Clawvio error", str(e), False)
                threading.Thread(target=_send, daemon=True).start()

        self.overlay.show_result(text, ok)
        self._tray_update_tooltip("local-stt  ·  ready")

    def _handle_assistant_ready(self, message: str, ok: bool):
        icon = (
            QSystemTrayIcon.MessageIcon.Information
            if ok
            else QSystemTrayIcon.MessageIcon.Warning
        )
        title = "Clawvio assistant" if ok else "Clawvio assistant failed"
        self.tray.showMessage(title, message, icon, 6000)

    def _handle_assistant_toast(self, title: str, message: str, ok: bool):
        self.overlay.show_assistant_toast(title, message, ok)

    def _quit(self):
        self.tray.hide()
        QApplication.quit()


def _acquire_instance_lock():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    try:
        sock.bind(("127.0.0.1", 47915))
        return sock
    except OSError:
        return None


if __name__ == "__main__":
    _lock = _acquire_instance_lock()
    if _lock is None:
        sys.exit(0)

    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    stt = LocalSTT()
    print(f"[local-stt] running on {SYS}  ·  Ctrl+Shift+Space to record")
    sys.exit(app.exec())
