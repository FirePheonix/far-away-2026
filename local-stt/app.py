"""
local-stt  –  lightweight background speech-to-text

Ctrl+Shift+Space  →  start recording
Ctrl+Shift+Space  →  stop  →  transcribe  →  clipboard  →  assistant API

Runs silently in the system tray. Very low idle RAM (~40 MB without model).
Uses faster-whisper (tiny model, ~75 MB) – no PyTorch required.

Linked to Far Away backend: POST /api/assistant (see .env.example).
"""

import ctypes
import math
import os
import platform
import random
import socket
import sys
import threading
import tkinter as tk
from typing import Optional, Callable

import customtkinter as ctk
import numpy as np
import pyperclip
import sounddevice as sd
from PIL import Image, ImageDraw
from pynput import keyboard as pynput_kb
import pystray
from faster_whisper import WhisperModel

from assistant_client import format_result_summary, is_enabled, send_transcript

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SYS = platform.system() 

_BG      = "#0E0F0F"
_BORDER  = "#2A2A2A"
_TEXT    = "#E8DCC8"
_SUBTEXT = "#8A8A8A"
_ACCENT  = "#1BB9CE"
_RED     = "#B87878"
_GREEN   = "#7DA888"
_CARD_W  = 640
_CARD_H  = 78
_CARD_H_R = 290

def _make_icon(size=64, color="#1BB9CE") -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size
    # Mic body
    d.rounded_rectangle([s*.30, s*.04, s*.70, s*.58], radius=s*.18, fill=color)
    # Arc (stand arm)
    d.arc([s*.14, s*.36, s*.86, s*.76], start=0, end=180, fill=color,
          width=max(3, int(s*.06)))
    # Stem
    cx = s // 2
    d.rectangle([cx - s*.04, s*.74, cx + s*.04, s*.88], fill=color)
    d.rectangle([s*.30, s*.86, s*.70, s*.94], fill=color)
    return img

def _apply_dwm(hwnd: int):
    if SYS != "Windows":
        return
    try:
        dwm = ctypes.windll.dwmapi
        DWMWA_WINDOW_CORNER_PREFERENCE = 33
        dwm.DwmSetWindowAttribute(
            hwnd, DWMWA_WINDOW_CORNER_PREFERENCE,
            ctypes.byref(ctypes.c_int(2)), ctypes.sizeof(ctypes.c_int),
        )
        dwm.DwmSetWindowAttribute(
            hwnd, 2,
            ctypes.byref(ctypes.c_int(2)), ctypes.sizeof(ctypes.c_int),
        )
    except Exception:
        pass

class FloatingOverlay(ctk.CTkToplevel):
    def __init__(self, master):
        super().__init__(master)
        self.overrideredirect(True)
        self.wm_attributes("-topmost", True)
        self.wm_attributes("-alpha", 0.0)
        self.configure(fg_color=_BG)

        self._state = "hidden"
        self._rms = 0.0
        self._dismiss_job = None
        self._wave_job = None
        self._pulse_job = None
        self._fade_job = None
        self._phase = 0.0

        self._build()
        self.withdraw()
        self.after(80, self._setup_platform)

    def _build(self):
        self.resizable(False, False)
        outer = ctk.CTkFrame(self, fg_color=_BORDER, corner_radius=18)
        outer.pack(fill="both", expand=True)
        inner = ctk.CTkFrame(outer, fg_color=_BG, corner_radius=16)
        inner.pack(fill="both", expand=True, padx=1, pady=1)

        # Top row
        row = ctk.CTkFrame(inner, fg_color="transparent")
        row.pack(fill="x", padx=20, pady=(16, 12))
        row.columnconfigure(1, weight=1)

        self._icon_lbl = ctk.CTkLabel(row, text="✦",
                                       font=ctk.CTkFont(size=22),
                                       text_color=_ACCENT, width=30)
        self._icon_lbl.grid(row=0, column=0, padx=(0, 14), sticky="w")

        self._status_lbl = ctk.CTkLabel(row, text="",
                                         font=ctk.CTkFont(family="Segoe UI", size=14),
                                         text_color=_TEXT, anchor="w")
        self._status_lbl.grid(row=0, column=1, sticky="w")

        self._canvas = tk.Canvas(row, width=44, height=36,
                                  bg=_BG, highlightthickness=0)
        self._canvas.grid(row=0, column=2, padx=(14, 0), sticky="e")
        self._bars = [
            self._canvas.create_rectangle(2 + i * 8, 15, 7 + i * 8, 21,
                                          fill=_ACCENT, outline="")
            for i in range(5)
        ]

        self._res_frame = ctk.CTkFrame(inner, fg_color="transparent")

        tk.Canvas(self._res_frame, height=1, bg=_BORDER,
                  highlightthickness=0).pack(fill="x", padx=20, pady=(0, 10))

        self._heard_lbl = ctk.CTkLabel(
            self._res_frame, text="",
            font=ctk.CTkFont(family="Segoe UI", size=11),
            text_color=_SUBTEXT, anchor="w",
            wraplength=_CARD_W - 60, justify="left",
        )
        self._heard_lbl.pack(anchor="w", padx=20, pady=(0, 6))

        self._result_box = ctk.CTkTextbox(
            self._res_frame, height=110,
            fg_color="#161717", border_color=_BORDER, border_width=1,
            corner_radius=10,
            font=ctk.CTkFont(family="Segoe UI", size=13),
            text_color=_TEXT, wrap="word",
        )
        self._result_box.pack(fill="x", padx=20, pady=(0, 8))
        self._result_box.configure(state="disabled")

        ctk.CTkLabel(
            self._res_frame,
            text="copied to clipboard  ·  Esc to close",
            font=ctk.CTkFont(family="Segoe UI", size=10),
            text_color=_SUBTEXT,
        ).pack(anchor="e", padx=24, pady=(0, 10))

        self.bind("<Escape>", lambda _: self.dismiss())

    def _setup_platform(self):
        self.update_idletasks()
        if SYS == "Windows":
            try:
                hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
                _apply_dwm(hwnd)
            except Exception:
                pass
        elif SYS == "Darwin":
            # Keep on top of everything including full-screen spaces
            try:
                self.wm_attributes("-topmost", True)
            except Exception:
                pass

    def _position(self, h: int):
        sw = self.winfo_screenwidth()
        x = (sw - _CARD_W) // 2
        self.geometry(f"{_CARD_W}x{h}+{x}+70")

    def set_rms(self, v: float):
        self._rms = v

    def show_listening(self):
        self.after(0, self._do_listening)

    def show_processing(self):
        self.after(0, self._do_processing)

    def show_result(self, text: str, ok: bool = True):
        self.after(0, lambda: self._do_result(text, ok))

    def show_assistant_status(self, msg: str, ok: bool = True):
        self.after(0, lambda: self._do_assistant_status(msg, ok))

    def dismiss(self):
        self.after(0, self._do_dismiss)

    def _do_listening(self):
        self._kill_jobs()
        self._state = "listening"
        self._res_frame.pack_forget()
        self._position(_CARD_H)
        self._icon_lbl.configure(text_color=_RED)
        self._status_lbl.configure(text="Listening  ·  press again to stop", text_color=_TEXT)
        self._bars_color(_RED)
        self.deiconify()
        self._fade_to(0.95)
        self._wave_job = self.after(60, self._tick_wave)

    def _do_processing(self):
        self._kill_jobs()
        self._state = "processing"
        self._res_frame.pack_forget()
        self._position(_CARD_H)
        self._icon_lbl.configure(text_color=_ACCENT)
        self._status_lbl.configure(text="Transcribing...", text_color=_SUBTEXT)
        self._bars_color(_ACCENT)
        self._phase = 0.0
        self._pulse_job = self.after(60, self._tick_pulse)

    def _do_result(self, text: str, ok: bool):
        self._kill_jobs()
        self._state = "result"
        color = _GREEN if ok else _RED
        self._icon_lbl.configure(text_color=color)
        self._status_lbl.configure(
            text="Done" if ok else "Nothing heard", text_color=color
        )
        self._bars_flat(_SUBTEXT)
        self._heard_lbl.configure(
            text=f'Heard: "{_trunc(text, 90)}"' if text else ""
        )
        self._result_box.configure(state="normal")
        self._result_box.delete("1.0", "end")
        self._result_box.insert("end", text)
        self._result_box.configure(state="disabled")
        self._res_frame.pack(fill="x")
        self._position(_CARD_H_R)
        self._dismiss_job = self.after(8000, self._do_dismiss)

    def _do_assistant_status(self, msg: str, ok: bool):
        if self._state != "result":
            return
        color = _GREEN if ok else _RED
        prefix = "Assistant" if ok else "Assistant error"
        self._status_lbl.configure(text=f"{prefix} · {msg}", text_color=color)

    def _do_dismiss(self):
        self._kill_jobs()
        self._state = "hidden"
        self._fade_to(0.0, on_done=self.withdraw)

    def _tick_wave(self):
        if self._state != "listening":
            return
        rms = min(1.0, self._rms * 6.0)
        for i, bid in enumerate(self._bars):
            p = max(0.0, min(1.0, rms + (i - 2) * 0.08 + random.uniform(-0.04, 0.04)))
            h = int(6 + p * 26)
            y = (36 - h) // 2
            self._canvas.coords(bid, 2 + i * 8, y, 7 + i * 8, y + h)
        self._wave_job = self.after(60, self._tick_wave)

    def _tick_pulse(self):
        if self._state != "processing":
            return
        self._phase += 0.15
        for i, bid in enumerate(self._bars):
            t = math.sin(self._phase + i * 0.8) * 0.5 + 0.5
            h = int(6 + t * 18)
            y = (36 - h) // 2
            self._canvas.coords(bid, 2 + i * 8, y, 7 + i * 8, y + h)
        self._pulse_job = self.after(60, self._tick_pulse)

    def _fade_to(self, target: float, on_done: Optional[Callable] = None, step=0.09):
        if self._fade_job:
            self.after_cancel(self._fade_job)
            self._fade_job = None
        self._fade_step(target, on_done, step)

    def _fade_step(self, target, on_done, step):
        try:
            cur = self.wm_attributes("-alpha")
        except Exception:
            return
        diff = target - cur
        if abs(diff) < step:
            self.wm_attributes("-alpha", target)
            if on_done:
                on_done()
            return
        self.wm_attributes("-alpha", cur + (step if diff > 0 else -step))
        self._fade_job = self.after(16, lambda: self._fade_step(target, on_done, step))

    def _bars_color(self, c):
        for b in self._bars:
            self._canvas.itemconfigure(b, fill=c)

    def _bars_flat(self, c):
        self._bars_color(c)
        for i, b in enumerate(self._bars):
            self._canvas.coords(b, 2 + i * 8, 15, 7 + i * 8, 21)

    def _kill_jobs(self):
        for attr in ("_dismiss_job", "_wave_job", "_pulse_job", "_fade_job"):
            j = getattr(self, attr, None)
            if j:
                try:
                    self.after_cancel(j)
                except Exception:
                    pass
            setattr(self, attr, None)

class LocalSTT:
    _HOTKEY = {"ctrl", "shift", "space"}

    def __init__(self):
        ctk.set_appearance_mode("dark")
        self.root = ctk.CTk()
        self.root.withdraw()
        self.root.title("local-stt")
        if SYS == "Windows":
            # Hide from taskbar
            self.root.wm_attributes("-toolwindow", True)

        self.overlay = FloatingOverlay(self.root)

        # Audio state
        self._recording = False
        self._stream: Optional[sd.InputStream] = None
        self._audio_chunks: list[np.ndarray] = []
        self._lock = threading.Lock()

        # Model (loaded lazily in background)
        self._model: Optional[WhisperModel] = None
        self._model_ready = threading.Event()

        # Assistant backend link
        self._assistant_enabled = is_enabled()

        # Hotkey tracker
        self._pressed: set[str] = set()
        self._hotkey_fired = False  # debounce

        # Build tray and start hotkey listener
        self._tray = self._build_tray()
        self._start_hotkey_listener()

        # Pre-load model so first use is instant
        threading.Thread(target=self._load_model, daemon=True).start()

    def _load_model(self):
        print("[local-stt] loading faster-whisper tiny model…")
        # tiny model is ~75 MB, no PyTorch, runs on CPU efficiently
        self._model = WhisperModel("tiny", device="cpu", compute_type="int8")
        self._model_ready.set()
        print("[local-stt] model ready")
        self._tray_update_tooltip("local-stt  ·  ready")

    def _build_tray(self) -> pystray.Icon:
        icon_img = _make_icon()
        menu = pystray.Menu(
            pystray.MenuItem("local-stt", None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                "Ctrl+Shift+Space to record", None, enabled=False
            ),
            pystray.MenuItem(
                "Assistant link",
                pystray.Menu(
                    pystray.MenuItem(
                        "Enabled",
                        self._toggle_assistant,
                        checked=lambda _: self._assistant_enabled,
                    ),
                ),
            ),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", self._quit),
        )
        icon = pystray.Icon("local-stt", icon_img, "local-stt  ·  loading…", menu)
        icon.run_detached()   # runs in its own daemon thread – main thread stays free
        return icon

    def _tray_update_tooltip(self, msg: str):
        try:
            self._tray.title = msg
        except Exception:
            pass

    def _start_hotkey_listener(self):
        def _tag(key):
            if key in (pynput_kb.Key.ctrl_l, pynput_kb.Key.ctrl_r,
                       pynput_kb.Key.ctrl):
                return "ctrl"
            if key in (pynput_kb.Key.shift, pynput_kb.Key.shift_l,
                       pynput_kb.Key.shift_r):
                return "shift"
            if key == pynput_kb.Key.space:
                return "space"
            return None

        def on_press(key):
            tag = _tag(key)
            if tag:
                self._pressed.add(tag)
            if self._pressed >= self._HOTKEY and not self._hotkey_fired:
                self._hotkey_fired = True
                self.root.after(0, self._toggle)

        def on_release(key):
            tag = _tag(key)
            if tag:
                self._pressed.discard(tag)
                if tag == "space":
                    self._hotkey_fired = False

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
        self._audio_chunks = []
        self.overlay.show_listening()
        self._tray_update_tooltip("local-stt  ·  recording…")

        def _cb(indata, frames, time_info, status):
            if self._recording:
                self._audio_chunks.append(indata.copy())
            self.overlay.set_rms(
                float(np.sqrt(np.mean(indata.astype(np.float32) ** 2)))
            )

        self._stream = sd.InputStream(
            samplerate=16000, channels=1, dtype=np.float32,
            blocksize=1024, callback=_cb,
        )
        self._stream.start()

    def _end_recording(self):
        self._recording = False
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None

        chunks = self._audio_chunks[:]
        self._audio_chunks = []
        self.overlay.show_processing()
        self._tray_update_tooltip("local-stt  ·  transcribing…")
        threading.Thread(target=self._transcribe, args=(chunks,), daemon=True).start()

    def _transcribe(self, chunks: list):
        try:
            if not self._model_ready.wait(timeout=30):
                self._finish("Model not ready – try again", ok=False)
                return

            if not chunks:
                self._finish("", ok=False)
                return

            audio = np.concatenate(chunks, axis=0).flatten().astype(np.float32)

            # Need at least ~0.3 seconds of audio
            if len(audio) < 4800:
                self._finish("", ok=False)
                return

            segments, _ = self._model.transcribe(
                audio, beam_size=1, language=None, vad_filter=True,
            )
            text = " ".join(s.text for s in segments).strip()
            self._finish(text, ok=bool(text))

        except Exception as e:
            print(f"[local-stt] transcription error: {e}")
            self._finish(f"Error: {e}", ok=False)

    def _toggle_assistant(self, icon=None, item=None):
        self._assistant_enabled = not self._assistant_enabled
        os.environ["ASSISTANT_ENABLED"] = "true" if self._assistant_enabled else "false"
        state = "on" if self._assistant_enabled else "off"
        print(f"[local-stt] assistant link {state}")
        self._tray_update_tooltip(f"local-stt  ·  assistant {state}")

    def _send_to_assistant(self, text: str):
        try:
            async_mode = os.environ.get("ASSISTANT_ASYNC", "false").lower() in ("1", "true", "yes")
            self.overlay.show_assistant_status("contacting backend…", ok=True)
            result = send_transcript(text, async_mode=async_mode)
            summary = format_result_summary(result)
            print(f"[local-stt] assistant: {summary}")
            self.overlay.show_assistant_status(summary, ok=True)
            self._tray_update_tooltip(f"local-stt  ·  {summary}")
        except Exception as e:
            print(f"[local-stt] assistant error: {e}")
            self.overlay.show_assistant_status(str(e), ok=False)
            self._tray_update_tooltip("local-stt  ·  assistant error")

    def _finish(self, text: str, ok: bool):
        if ok and text:
            pyperclip.copy(text)
            print(f"[local-stt] copied: {text}")
        self.root.after(0, lambda: self.overlay.show_result(text, ok))
        if ok and text and self._assistant_enabled:
            self._tray_update_tooltip("local-stt  ·  sending to assistant…")
            threading.Thread(target=self._send_to_assistant, args=(text,), daemon=True).start()
        else:
            self._tray_update_tooltip("local-stt  ·  ready")

    def _quit(self, icon=None, item=None):
        print("[local-stt] quitting")
        try:
            self._tray.stop()
        except Exception:
            pass
        self.root.after(0, self.root.quit)

    def run(self):
        print(f"[local-stt] running on {SYS}  ·  Ctrl+Shift+Space to record")
        try:
            self.root.mainloop()
        except KeyboardInterrupt:
            self._quit()

def _trunc(s: str, n: int) -> str:
    return s if len(s) <= n else s[:n - 1] + "…"

def _acquire_instance_lock():
    """Bind a local socket to ensure only one instance runs."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    try:
        sock.bind(("127.0.0.1", 47915))
        return sock  # keep reference so it stays bound
    except OSError:
        return None  # when already running

if __name__ == "__main__":
    _lock = _acquire_instance_lock()
    if _lock is None:
        sys.exit(0)  # another instance is already running
    LocalSTT().run()
