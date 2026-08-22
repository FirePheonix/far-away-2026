//! Top-of-screen notch overlay (desktop Dynamic Island).
//!
//! The window is full monitor width and sits at y=0. Only the black notch is
//! painted — the rest of the viewport stays transparent. The silhouette hangs
//! from the top bezel: concave flares at the top corners, stadium rounding
//! along the bottom.

use crate::api::{PendingTask, ReasonChip, Trace};
use egui::{self, Color32, CornerRadius, Pos2, Rect, RichText, Sense, Shape, Stroke, Vec2};

/// A completed run entry kept in the session history sidebar.
#[derive(Debug, Clone)]
pub struct SessionEntry {
    /// Short first ~60 chars of the transcript.
    pub transcript: String,
    /// "completed" | "failed" | "abandoned"
    pub status: String,
    /// Human-readable summary or error.
    pub message: String,
    /// How many steps ran.
    pub steps: usize,
}

/// Collapsed notch height (logical px), not counting the top-edge flares.
pub const PILL_H: f32 = 56.0;
/// Notch width when idle / listening.
pub const PILL_W_IDLE: f32 = 420.0;
/// Extra height added when the transcript result is shown.
pub const PILL_H_RESULT_EXTRA: f32 = 200.0;
/// Extra height for the human-feedback task panel.
pub const PILL_H_FEEDBACK_EXTRA: f32 = 250.0;
/// Extra height for the live agent-flow step list.
pub const PILL_H_FLOW_EXTRA: f32 = 300.0;
/// Extra height for the yes/no confirmation.
pub const PILL_H_CONFIRM_EXTRA: f32 = 130.0;
/// Extra height for reason chips plus the note field.
pub const PILL_H_REASON_EXTRA: f32 = 250.0;
/// Extra height for the unresolved / handback list.
pub const PILL_H_UNRESOLVED_EXTRA: f32 = 320.0;
/// Window height when a result is visible.
#[allow(dead_code)]
pub const PILL_H_RESULT: f32 = PILL_H + PILL_H_RESULT_EXTRA;
/// Window height when a pending task needs a decision.
#[allow(dead_code)]
pub const PILL_H_FEEDBACK: f32 = PILL_H + PILL_H_FEEDBACK_EXTRA;
/// Concave flare radius where the notch meets the top of the screen.
const FLARE: f32 = 16.0;
/// Bottom-corner radius (kept constant so expansion doesn't turn into a blob).
const BOTTOM_R: f32 = 28.0;

const BG: Color32 = Color32::from_rgb(0x00, 0x00, 0x00);
const TEXT: Color32 = Color32::from_rgb(0xE8, 0xE8, 0xE8);
const MUTED: Color32 = Color32::from_rgb(0x9A, 0x9A, 0x9A);
const THUMB_BG: Color32 = Color32::from_rgb(0x2A, 0x2A, 0x2A);
const ACCENT: Color32 = Color32::from_rgb(0x1B, 0xB9, 0xCE);
const RED: Color32 = Color32::from_rgb(0xC0, 0x7A, 0x7A);
const GREEN: Color32 = Color32::from_rgb(0x7D, 0xA8, 0x88);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordMode {
    Ocr,
    Command,
    /// Dictating the free-text half of a closure reason.
    ReasonNote,
}

/// What a confirmation or reason prompt will do once the user commits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PendingClosure {
    SkipTask { task_id: String },
    AbandonTask { task_id: String },
    /// Answering a step_failure handback with "skip" or "abandon".
    DecideStep { task_id: String, decision: String },
    StopRun { run_id: String, request_id: String },
}

impl PendingClosure {
    fn verb(&self) -> &'static str {
        match self {
            PendingClosure::SkipTask { .. } => "Skip this step",
            PendingClosure::AbandonTask { .. } => "Abandon this task",
            PendingClosure::DecideStep { decision, .. } => {
                if decision == "skip" {
                    "Skip this step"
                } else {
                    "Abandon this run"
                }
            }
            PendingClosure::StopRun { .. } => "Stop this run",
        }
    }

    /// Destructive closures get a yes/no gate before the reason prompt.
    fn needs_confirm(&self) -> bool {
        !matches!(self, PendingClosure::SkipTask { .. })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum OverlayState {
    Hidden,
    Listening { mode: RecordMode },
    Processing,
    Sending,
    Result { text: String, ok: bool },
    Feedback {
        tasks: Vec<PendingTask>,
        index: usize,
        changing: bool,
        change_text: String,
        busy: bool,
        status: String,
    },
    /// Live agent flow: the plan, per-step status, and the failure hand-back.
    Flow {
        trace: Trace,
        busy: bool,
        status: String,
    },
    Confirm {
        prompt: String,
        detail: String,
        pending: PendingClosure,
        previous: Box<OverlayState>,
    },
    ReasonPrompt {
        title: String,
        pending: PendingClosure,
        chips: Vec<ReasonChip>,
        selected: usize,
        note: String,
        dictating: bool,
        previous: Box<OverlayState>,
    },
    /// Handback inbox — what is still owed back to the user.
    Unresolved {
        data: crate::api::Unresolved,
        status: String,
    },
    Pairing { code: String, claim_url: String },
}

#[derive(Debug, Clone, Default)]
pub enum OverlayAction {
    #[default]
    None,
    Skip {
        task_id: String,
        reason_code: String,
        note: Option<String>,
    },
    Abandon {
        task_id: String,
        reason_code: String,
        note: Option<String>,
    },
    Decide {
        task_id: String,
        decision: String,
        reason_code: String,
        note: Option<String>,
    },
    StopRun {
        run_id: String,
        request_id: String,
        reason_code: String,
        note: Option<String>,
    },
    Pause {
        task_id: String,
        minutes: i64,
    },
    Change {
        task_id: String,
        instruction: String,
    },
    /// User picked one of the AI-generated propose_options choices.
    ChooseOption {
        task_id: String,
        value: String,
    },
    /// Open the dashboard so the user can reconnect a revoked integration.
    Reconnect,
    /// Jump from the Unresolved inbox onto a still-open task.
    OpenTask { task: PendingTask },
    OpenPairUrl { url: String },
    ShowUnresolved,
    /// Start recording so the user can speak the reason note.
    Dictate,
}

pub struct Overlay {
    pub state: OverlayState,
    pub rms: f32,
    pub alpha: f32,
    pub screen_w: f32,
    pub max_scroll_h: f32,
    /// Reason vocabulary from the backend, with a usable local fallback.
    pub reason_chips: Vec<ReasonChip>,
    /// Completed/failed/abandoned runs from this session, newest-first.
    /// Shown in a compact right-side panel so the user can see what already ran.
    pub session_history: Vec<SessionEntry>,
    dismiss_at: Option<f64>,
    phase: f32,
}

impl Default for Overlay {
    fn default() -> Self {
        Self {
            state: OverlayState::Hidden,
            rms: 0.0,
            alpha: 0.0,
            screen_w: 1920.0,
            max_scroll_h: 160.0,
            reason_chips: default_reason_chips(),
            session_history: Vec::new(),
            dismiss_at: None,
            phase: 0.0,
        }
    }
}

/// Used until /closure-reasons responds, and if it never does. The codes match
/// the server's vocabulary so a closure recorded offline still classifies.
fn default_reason_chips() -> Vec<ReasonChip> {
    [
        ("wrong_intent", "Not what I asked"),
        ("ai_got_it_wrong", "Got it wrong"),
        ("no_longer_needed", "Don't need it"),
        ("doing_it_manually", "I'll do it"),
        ("missing_info", "Missing info"),
        ("deferred", "Later"),
    ]
    .iter()
    .map(|(code, label)| ReasonChip {
        code: (*code).to_string(),
        label: (*label).to_string(),
    })
    .collect()
}

impl Overlay {
    pub fn show_listening(&mut self, mode: RecordMode) {
        self.state = OverlayState::Listening { mode };
        self.dismiss_at = None;
    }
    pub fn show_processing(&mut self) {
        self.state = OverlayState::Processing;
        self.dismiss_at = None;
    }
    pub fn show_sending(&mut self) {
        self.state = OverlayState::Sending;
        self.dismiss_at = None;
    }
    pub fn show_pairing(&mut self, code: String, claim_url: String) {
        self.state = OverlayState::Pairing { code, claim_url };
        self.dismiss_at = None;
    }
    pub fn show_result(&mut self, text: String, ok: bool, now: f64) {
        self.state = OverlayState::Result { text, ok };
        self.dismiss_at = Some(now + 8.0);
    }
    pub fn show_feedback(&mut self, tasks: Vec<PendingTask>) {
        if tasks.is_empty() {
            if matches!(self.state, OverlayState::Feedback { .. }) {
                self.dismiss();
            }
            return;
        }
        let (index, changing, change_text) = match &self.state {
            OverlayState::Feedback {
                index,
                changing,
                change_text,
                ..
            } => {
                let idx = (*index).min(tasks.len().saturating_sub(1));
                (idx, *changing, change_text.clone())
            }
            _ => (0, false, String::new()),
        };
        self.state = OverlayState::Feedback {
            tasks,
            index,
            changing,
            change_text,
            busy: false,
            status: String::new(),
        };
        self.dismiss_at = None;
    }
    pub fn set_feedback_busy(&mut self, busy: bool, status: impl Into<String>) {
        let status = status.into();
        match &mut self.state {
            OverlayState::Feedback {
                busy: b, status: s, ..
            }
            | OverlayState::Flow {
                busy: b, status: s, ..
            } => {
                *b = busy;
                *s = status;
            }
            OverlayState::Unresolved { status: s, .. } => *s = status,
            _ => {}
        }
    }

    /// Shows the live flow for a run. Keeps the existing panel in place when a
    /// poll returns the same request so the overlay doesn't flicker.
    pub fn show_flow(&mut self, trace: Trace) {
        let (busy, status) = match &self.state {
            OverlayState::Flow { busy, status, .. } => (*busy, status.clone()),
            _ => (false, String::new()),
        };
        self.state = OverlayState::Flow {
            trace,
            busy,
            status,
        };
        self.dismiss_at = None;
    }

    pub fn show_unresolved(&mut self, data: crate::api::Unresolved) {
        self.state = OverlayState::Unresolved {
            data,
            status: String::new(),
        };
        self.dismiss_at = None;
    }

    pub fn is_flow(&self) -> bool {
        matches!(self.state, OverlayState::Flow { .. })
    }

    /// True while a closure is being collected, so task polling shouldn't
    /// replace the panel under the user's hands.
    pub fn is_collecting_closure(&self) -> bool {
        matches!(
            self.state,
            OverlayState::Confirm { .. } | OverlayState::ReasonPrompt { .. }
        )
    }

    /// Enters the confirm-then-reason flow for a closure.
    pub fn begin_closure(
        &mut self,
        pending: PendingClosure,
        detail: impl Into<String>,
        chips: Vec<ReasonChip>,
    ) {
        let previous = Box::new(self.state.clone());
        if pending.needs_confirm() {
            self.state = OverlayState::Confirm {
                prompt: format!("{}?", pending.verb()),
                detail: detail.into(),
                pending,
                previous,
            };
        } else {
            self.state = OverlayState::ReasonPrompt {
                title: pending.verb().to_string(),
                pending,
                chips,
                selected: 0,
                note: String::new(),
                dictating: false,
                previous,
            };
        }
        self.dismiss_at = None;
    }

    /// Called when the user's spoken note has been transcribed.
    pub fn append_reason_note(&mut self, text: &str) {
        if let OverlayState::ReasonPrompt { note, dictating, .. } = &mut self.state {
            if !note.is_empty() && !note.ends_with(' ') {
                note.push(' ');
            }
            note.push_str(text.trim());
            *dictating = false;
        }
    }

    pub fn set_dictating(&mut self, on: bool) {
        if let OverlayState::ReasonPrompt { dictating, .. } = &mut self.state {
            *dictating = on;
        }
    }

    pub fn is_reason_prompt(&self) -> bool {
        matches!(self.state, OverlayState::ReasonPrompt { .. })
    }
    pub fn is_confirm(&self) -> bool {
        matches!(self.state, OverlayState::Confirm { .. })
    }

    /// Spoken yes/no while a confirmation is on screen. Returns true if the
    /// utterance was recognised as an answer.
    pub fn apply_spoken_confirm(&mut self, text: &str) -> bool {
        let lowered = text.to_lowercase();
        let yes = ["yes", "yeah", "yep", "yup", "ok", "okay", "confirm", "sure"]
            .iter()
            .any(|w| lowered.split_whitespace().any(|t| t.trim_matches(|c: char| !c.is_alphabetic()) == *w));
        let no = ["no", "nope", "nah", "cancel", "stop"]
            .iter()
            .any(|w| lowered.split_whitespace().any(|t| t.trim_matches(|c: char| !c.is_alphabetic()) == *w));
        if yes {
            self.advance_confirm();
            true
        } else if no {
            self.cancel_closure();
            true
        } else {
            false
        }
    }
    pub fn dismiss(&mut self) {
        self.state = OverlayState::Hidden;
        self.dismiss_at = None;
    }

    /// Record a settled run into the session history sidebar (newest-first, cap 20).
    pub fn push_session_entry(&mut self, entry: SessionEntry) {
        self.session_history.insert(0, entry);
        self.session_history.truncate(20);
    }
    /// Auto-hide after a delay. Used once a run reaches a terminal state.
    pub fn arm_dismiss(&mut self, now: f64, secs: f64) {
        self.dismiss_at = Some(now + secs);
    }
    pub fn is_visible(&self) -> bool {
        !matches!(self.state, OverlayState::Hidden) || self.alpha > 0.01
    }
    pub fn desired_height(&self) -> f32 {
        match &self.state {
            OverlayState::Result { .. } | OverlayState::Pairing { .. } => PILL_H_RESULT,
            OverlayState::Feedback { changing, .. } => {
                if *changing {
                    PILL_H_FEEDBACK + 40.0
                } else {
                    PILL_H_FEEDBACK
                }
            }
            OverlayState::Flow { trace, .. } => {
                // Grow with the plan, but stop before it becomes a wall.
                let rows = trace.steps.len().clamp(1, 6) as f32;
                let handback = if trace.tasks.is_empty() { 0.0 } else { 56.0 };
                PILL_H + 96.0 + rows * 26.0 + handback
            }
            OverlayState::Confirm { .. } => PILL_H + PILL_H_CONFIRM_EXTRA,
            OverlayState::ReasonPrompt { .. } => PILL_H + PILL_H_REASON_EXTRA,
            OverlayState::Unresolved { .. } => PILL_H + PILL_H_UNRESOLVED_EXTRA,
            _ => PILL_H,
        }
    }

    pub fn tick(&mut self, now: f64, dt: f32) {
        let target = if matches!(self.state, OverlayState::Hidden) {
            0.0
        } else {
            1.0
        };
        let step = if self.alpha < target { 0.20 } else { 0.08 };
        if (self.alpha - target).abs() < 0.005 {
            self.alpha = target;
        } else if self.alpha < target {
            self.alpha = (self.alpha + step).min(target);
        } else {
            self.alpha = (self.alpha - step).max(target);
        }
        self.phase += dt * 7.0;
        if let Some(t) = self.dismiss_at {
            if now >= t {
                self.dismiss();
            }
        }
    }

    /// Draw everything. Returns a user action for the app to execute.
    pub fn ui(&mut self, ctx: &egui::Context, ui: &mut egui::Ui) -> OverlayAction {
        let mut action = OverlayAction::None;
        let mut should_dismiss = false;
        let sticky = matches!(
            self.state,
            OverlayState::Feedback { .. }
                | OverlayState::Pairing { .. }
                | OverlayState::Flow { .. }
                | OverlayState::Confirm { .. }
                | OverlayState::ReasonPrompt { .. }
                | OverlayState::Unresolved { .. }
        );
        // Center in the real window, not a guessed monitor width.
        let canvas = ui.max_rect();
        let sw = canvas.width().max(1.0);

        let expanded = matches!(
            self.state,
            OverlayState::Result { .. }
                | OverlayState::Feedback { .. }
                | OverlayState::Pairing { .. }
                | OverlayState::Flow { .. }
                | OverlayState::Confirm { .. }
                | OverlayState::ReasonPrompt { .. }
                | OverlayState::Unresolved { .. }
        );
        let pill_w = if expanded {
            (sw * 0.48).max(PILL_W_IDLE).min(sw - 48.0)
        } else {
            PILL_W_IDLE.min(sw - 48.0)
        };
        let pill_h = if expanded {
            self.desired_height().min(canvas.height())
        } else {
            PILL_H
        };
        let pill_x = canvas.min.x + (sw - pill_w) * 0.5;
        let pill_rect = Rect::from_min_size(Pos2::new(pill_x, canvas.min.y), Vec2::new(pill_w, pill_h));

        let painter = ui.painter();
        let bg = Color32::from_rgba_unmultiplied(BG.r(), BG.g(), BG.b(), (255.0 * self.alpha) as u8);

        draw_notch(painter, pill_rect, bg);

        let pill_resp = ui.allocate_rect(pill_rect, Sense::click());
        if pill_resp.clicked() && !sticky {
            should_dismiss = true;
        }

        let chrome = Rect::from_min_size(pill_rect.min, Vec2::new(pill_w, PILL_H));
        let mut bar = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(chrome.shrink2(Vec2::new(18.0, 0.0)))
                .layout(egui::Layout::left_to_right(egui::Align::Center)),
        );
        bar.set_height(PILL_H);
        let inner = bar.max_rect();
        let col_w = inner.width() / 3.0;
        let left = Rect::from_min_size(inner.min, Vec2::new(col_w, PILL_H));
        let mid = Rect::from_min_size(
            Pos2::new(inner.min.x + col_w, inner.min.y),
            Vec2::new(col_w, PILL_H),
        );
        let right = Rect::from_min_size(
            Pos2::new(inner.min.x + col_w * 2.0, inner.min.y),
            Vec2::new(col_w, PILL_H),
        );
        {
            let mut left_ui = bar.new_child(
                egui::UiBuilder::new()
                    .max_rect(left)
                    .layout(egui::Layout::left_to_right(egui::Align::Center)),
            );
            self.draw_thumb(&mut left_ui);
        }
        {
            let mut mid_ui = bar.new_child(
                egui::UiBuilder::new()
                    .max_rect(mid)
                    .layout(egui::Layout::centered_and_justified(egui::Direction::LeftToRight)),
            );
            self.draw_center_ring(&mut mid_ui);
        }
        {
            let mut right_ui = bar.new_child(
                egui::UiBuilder::new()
                    .max_rect(right)
                    .layout(egui::Layout::right_to_left(egui::Align::Center)),
            );
            if self.draw_right_control(&mut right_ui) {
                should_dismiss = true;
            }
        }

        if let OverlayState::Result { text, ok } = &self.state.clone() {
            let ok = *ok;
            let text = text.clone();
            let body = Rect::from_min_size(
                Pos2::new(pill_rect.min.x + 18.0, pill_rect.min.y + PILL_H - 4.0),
                Vec2::new(pill_w - 36.0, (pill_h - PILL_H - 10.0).max(40.0)),
            );
            let mut child = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(body)
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );
            let caption = if ok {
                "Done"
            } else if text.is_empty() {
                "Nothing heard"
            } else {
                "Needs attention"
            };
            child.label(RichText::new(caption).size(11.0).color(MUTED));
            child.add_space(6.0);
            egui::ScrollArea::vertical()
                .max_height(self.max_scroll_h)
                .auto_shrink([false, true])
                .show(&mut child, |ui| {
                    let body_text = if text.is_empty() {
                        "Try again — no speech detected."
                    } else {
                        text.as_str()
                    };
                    ui.label(RichText::new(body_text).size(13.0).color(TEXT));
                });
        }

        if matches!(self.state, OverlayState::Feedback { .. }) {
            action = self.draw_feedback_body(ui, pill_rect, pill_w, pill_h);
        }
        if matches!(self.state, OverlayState::Flow { .. }) {
            action = self.draw_flow_body(ui, pill_rect, pill_w, pill_h);
        }
        if matches!(self.state, OverlayState::Confirm { .. }) {
            action = self.draw_confirm_body(ui, pill_rect, pill_w, pill_h);
        }
        if matches!(self.state, OverlayState::ReasonPrompt { .. }) {
            action = self.draw_reason_body(ui, pill_rect, pill_w, pill_h);
        }
        if matches!(self.state, OverlayState::Unresolved { .. }) {
            action = self.draw_unresolved_body(ui, pill_rect, pill_w, pill_h);
        }
        if matches!(self.state, OverlayState::Pairing { .. }) {
            if let OverlayAction::OpenPairUrl { url } = self.draw_pairing_body(ui, pill_rect, pill_w, pill_h)
            {
                action = OverlayAction::OpenPairUrl { url };
            }
        }

        // Right-side session history panel — always drawn when there is history,
        // independent of the main notch state.
        self.draw_session_panel(ui, canvas);

        if let Some(keyed) = self.handle_keys(ctx) {
            action = keyed;
        }

        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            match &mut self.state {
                OverlayState::Feedback { changing, .. } => {
                    if *changing {
                        *changing = false;
                    } else {
                        should_dismiss = true;
                    }
                }
                // Backing out of a closure returns to whatever was on screen,
                // so an accidental keypress can't lose the run view.
                OverlayState::Confirm { previous, .. }
                | OverlayState::ReasonPrompt { previous, .. } => {
                    self.state = (**previous).clone();
                }
                _ => should_dismiss = true,
            }
        }
        if should_dismiss {
            self.dismiss();
        }
        action
    }

    /// Keyboard shortcuts: Y/N on a confirmation, 1-6 to pick a reason chip,
    /// Enter to commit. Voice-first product, but the hands should still work.
    fn handle_keys(&mut self, ctx: &egui::Context) -> Option<OverlayAction> {
        let (yes, no, enter, digits) = ctx.input(|i| {
            let digits = [
                egui::Key::Num1,
                egui::Key::Num2,
                egui::Key::Num3,
                egui::Key::Num4,
                egui::Key::Num5,
                egui::Key::Num6,
            ]
            .iter()
            .position(|k| i.key_pressed(*k));
            (
                i.key_pressed(egui::Key::Y),
                i.key_pressed(egui::Key::N),
                i.key_pressed(egui::Key::Enter),
                digits,
            )
        });

        enum Intent {
            Confirm,
            Cancel,
            Pick(usize),
            Commit,
        }

        let intent = match &self.state {
            OverlayState::Confirm { .. } => {
                if yes || enter {
                    Some(Intent::Confirm)
                } else if no {
                    Some(Intent::Cancel)
                } else {
                    None
                }
            }
            OverlayState::ReasonPrompt { chips, .. } => {
                if enter {
                    Some(Intent::Commit)
                } else {
                    digits.filter(|d| *d < chips.len()).map(Intent::Pick)
                }
            }
            _ => None,
        };

        match intent {
            Some(Intent::Confirm) => {
                self.advance_confirm();
                None
            }
            Some(Intent::Cancel) => {
                self.cancel_closure();
                None
            }
            Some(Intent::Pick(d)) => {
                if let OverlayState::ReasonPrompt { selected, .. } = &mut self.state {
                    *selected = d;
                }
                None
            }
            Some(Intent::Commit) => Some(self.commit_reason()),
            None => None,
        }
    }

    /// Confirmed — move on to collecting the reason.
    fn advance_confirm(&mut self) {
        let (pending, previous) = match &self.state {
            OverlayState::Confirm {
                pending, previous, ..
            } => (pending.clone(), previous.clone()),
            _ => return,
        };
        self.state = OverlayState::ReasonPrompt {
            title: pending.verb().to_string(),
            pending,
            chips: self.reason_chips.clone(),
            selected: 0,
            note: String::new(),
            dictating: false,
            previous,
        };
    }

    fn cancel_closure(&mut self) {
        let previous = match &self.state {
            OverlayState::Confirm { previous, .. }
            | OverlayState::ReasonPrompt { previous, .. } => Some((**previous).clone()),
            _ => None,
        };
        if let Some(prev) = previous {
            self.state = prev;
        }
    }

    /// Turns the selected chip plus the (possibly spoken) note into an action.
    fn commit_reason(&mut self) -> OverlayAction {
        let (pending, reason_code, note, previous) = match &self.state {
            OverlayState::ReasonPrompt {
                pending,
                chips,
                selected,
                note,
                previous,
                ..
            } => (
                pending.clone(),
                chips
                    .get(*selected)
                    .map(|c| c.code.clone())
                    .unwrap_or_else(|| "unspecified".to_string()),
                if note.trim().is_empty() {
                    None
                } else {
                    Some(note.trim().to_string())
                },
                previous.clone(),
            ),
            _ => return OverlayAction::None,
        };

        let action = match pending {
            PendingClosure::SkipTask { task_id } => OverlayAction::Skip {
                task_id,
                reason_code,
                note,
            },
            PendingClosure::AbandonTask { task_id } => OverlayAction::Abandon {
                task_id,
                reason_code,
                note,
            },
            PendingClosure::DecideStep { task_id, decision } => OverlayAction::Decide {
                task_id,
                decision,
                reason_code,
                note,
            },
            PendingClosure::StopRun { run_id, request_id } => OverlayAction::StopRun {
                run_id,
                request_id,
                reason_code,
                note,
            },
        };

        // Go back to the run view; the app will show progress there.
        self.state = *previous;
        self.set_feedback_busy(true, "Recording your reason…");
        action
    }

    fn draw_feedback_body(
        &mut self,
        ui: &mut egui::Ui,
        pill_rect: Rect,
        pill_w: f32,
        pill_h: f32,
    ) -> OverlayAction {
        let mut action = OverlayAction::None;
        let OverlayState::Feedback {
            tasks,
            index,
            changing,
            change_text,
            busy,
            status,
        } = &mut self.state
        else {
            return OverlayAction::None;
        };
        if tasks.is_empty() {
            return OverlayAction::None;
        }
        *index = (*index).min(tasks.len() - 1);
        let task = tasks[*index].clone();
        let n = tasks.len();
        let idx = *index;
        let is_busy = *busy;

        let body = Rect::from_min_size(
            Pos2::new(pill_rect.min.x + 18.0, pill_rect.min.y + PILL_H - 4.0),
            Vec2::new(pill_w - 36.0, (pill_h - PILL_H - 10.0).max(80.0)),
        );
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(body)
                .layout(egui::Layout::top_down(egui::Align::Min)),
        );

        child.horizontal(|ui| {
            ui.label(
                RichText::new(format!("Needs you  ·  {} / {}", idx + 1, n))
                    .size(11.0)
                    .color(MUTED),
            );
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if n > 1 && ui.add(ghost_btn("Next", !is_busy)).clicked() {
                    *index = (idx + 1) % n;
                }
            });
        });
        child.add_space(8.0);
        egui::ScrollArea::vertical()
            .max_height(72.0)
            .auto_shrink([false, true])
            .show(&mut child, |ui| {
                ui.label(RichText::new(&task.description).size(13.5).color(TEXT));
            });
        child.add_space(8.0);

        if *changing {
            child.label(
                RichText::new("What should change?")
                    .size(11.0)
                    .color(MUTED),
            );
            child.add_space(4.0);
            child.add(
                egui::TextEdit::multiline(change_text)
                    .desired_width(f32::INFINITY)
                    .desired_rows(3)
                    .hint_text("e.g. use the other calendar, drop step 2…"),
            );
            child.add_space(8.0);
            child.horizontal(|ui| {
                if ui.add(action_btn("Send change", ACCENT, !is_busy)).clicked()
                    && !change_text.trim().is_empty()
                {
                    action = OverlayAction::Change {
                        task_id: task.id.clone(),
                        instruction: change_text.trim().to_string(),
                    };
                }
                if ui.add(ghost_btn("Cancel", !is_busy)).clicked() {
                    *changing = false;
                    change_text.clear();
                }
            });
        } else if task.is_options() {
            // ── AI-generated propose_options ──────────────────────────────────
            // Show the AI's situation + its own dynamically generated buttons.
            if let Some(ref sit) = task.situation {
                child.label(RichText::new(sit).size(12.0).color(MUTED));
                child.add_space(8.0);
            }
            for opt in &task.ai_options {
                child.horizontal(|ui| {
                    if ui.add(action_btn(&opt.label, ACCENT, !is_busy)).clicked() {
                        action = OverlayAction::ChooseOption {
                            task_id: task.id.clone(),
                            value: opt.value.clone(),
                        };
                    }
                    ui.add_space(6.0);
                    ui.label(RichText::new(&opt.description).size(11.0).color(MUTED));
                });
                child.add_space(4.0);
            }
        } else {
            child.horizontal(|ui| {
                // reason_code is left empty on purpose: the app routes these
                // through the confirm/reason prompt before anything closes.
                if ui.add(action_btn("Abandon", RED, !is_busy)).clicked() {
                    action = OverlayAction::Abandon {
                        task_id: task.id.clone(),
                        reason_code: String::new(),
                        note: None,
                    };
                }
                if ui.add(action_btn("Skip", MUTED, !is_busy)).clicked() {
                    action = OverlayAction::Skip {
                        task_id: task.id.clone(),
                        reason_code: String::new(),
                        note: None,
                    };
                }
                if ui.add(action_btn("Change", ACCENT, !is_busy)).clicked() {
                    *changing = true;
                }
            });
            child.add_space(6.0);
            // Snooze. Capped server-side so a paused task always resumes into
            // the same run rather than being lost.
            child.horizontal(|ui| {
                ui.label(RichText::new("Later:").size(10.5).color(MUTED));
                for (label, minutes) in [("15m", 15_i64), ("1h", 60), ("3h", 180), ("Tonight", 480)] {
                    if ui.add(chip_btn(label, MUTED, false)).clicked() {
                        action = OverlayAction::Pause {
                            task_id: task.id.clone(),
                            minutes,
                        };
                    }
                }
            });
        }

        if !status.is_empty() {
            child.add_space(6.0);
            child.label(RichText::new(status.as_str()).size(11.0).color(MUTED));
        }
        action
    }

    /// Carves the area under the notch chrome that a panel draws into.
    fn body_ui(
        ui: &mut egui::Ui,
        pill_rect: Rect,
        pill_w: f32,
        pill_h: f32,
        min_h: f32,
    ) -> egui::Ui {
        let body = Rect::from_min_size(
            Pos2::new(pill_rect.min.x + 18.0, pill_rect.min.y + PILL_H - 4.0),
            Vec2::new(pill_w - 36.0, (pill_h - PILL_H - 10.0).max(min_h)),
        );
        ui.new_child(
            egui::UiBuilder::new()
                .max_rect(body)
                .layout(egui::Layout::top_down(egui::Align::Min)),
        )
    }

    /// The live agent flow: what the assistant planned, where it is now, and
    /// the exact reason a step failed.
    fn draw_flow_body(
        &mut self,
        ui: &mut egui::Ui,
        pill_rect: Rect,
        pill_w: f32,
        pill_h: f32,
    ) -> OverlayAction {
        let OverlayState::Flow {
            trace,
            busy,
            status,
        } = &self.state
        else {
            return OverlayAction::None;
        };
        let trace = trace.clone();
        let is_busy = *busy;
        let status = status.clone();
        let mut action = OverlayAction::None;

        let mut child = Self::body_ui(ui, pill_rect, pill_w, pill_h, 80.0);

        let done = trace
            .steps
            .iter()
            .filter(|s| s.status == "succeeded")
            .count();
        let header = if trace.steps.is_empty() {
            "Planning…".to_string()
        } else {
            format!("Step {} of {}", (done + 1).min(trace.steps.len()), trace.steps.len())
        };

        child.horizontal(|ui| {
            ui.label(RichText::new(header).size(11.0).color(MUTED));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if let (Some(run_id), false) = (trace.run_id.clone(), trace.is_settled()) {
                    if ui.add(ghost_btn("Stop", !is_busy)).clicked() {
                        action = OverlayAction::StopRun {
                            run_id,
                            request_id: trace.request_id.clone(),
                            reason_code: String::new(),
                            note: None,
                        };
                    }
                }
            });
        });
        child.add_space(6.0);

        egui::ScrollArea::vertical()
            .max_height(150.0)
            .auto_shrink([false, true])
            .show(&mut child, |ui| {
                for step in &trace.steps {
                    ui.horizontal(|ui| {
                        let (glyph, color) = step_glyph(&step.status);
                        ui.label(RichText::new(glyph).size(12.0).color(color).monospace());
                        ui.add_space(2.0);
                        let mut label = step.title.clone();
                        if step.attempt > 0 && step.status != "succeeded" {
                            label.push_str(&format!("  (retry {})", step.attempt));
                        }
                        ui.label(RichText::new(label).size(12.5).color(
                            if step.status == "pending" { MUTED } else { TEXT },
                        ));
                    });
                    // The whole point of the trace: say what went wrong, in words.
                    if let Some(err) = &step.error_message {
                        ui.horizontal(|ui| {
                            ui.add_space(16.0);
                            ui.label(RichText::new(err).size(11.0).color(RED));
                        });
                    }
                }
            });

        // A failed step hands the decision back here.
        if let Some(task) = trace.tasks.iter().find(|t| t.is_failure()) {
            child.add_space(8.0);
            child.label(
                RichText::new(
                    task.error_message
                        .clone()
                        .unwrap_or_else(|| task.description.clone()),
                )
                .size(12.0)
                .color(RED),
            );
            child.add_space(6.0);
            child.horizontal(|ui| {
                if task.error_kind.as_deref() == Some("auth")
                    && ui.add(action_btn("Reconnect", ACCENT, !is_busy)).clicked()
                {
                    action = OverlayAction::Reconnect;
                }
                if task.allows("retry") && ui.add(action_btn("Retry", ACCENT, !is_busy)).clicked() {
                    action = OverlayAction::Decide {
                        task_id: task.id.clone(),
                        decision: "retry".into(),
                        reason_code: "retried".into(),
                        note: None,
                    };
                }
                if ui.add(action_btn("Skip step", MUTED, !is_busy)).clicked() {
                    action = OverlayAction::Decide {
                        task_id: task.id.clone(),
                        decision: "skip".into(),
                        reason_code: String::new(),
                        note: None,
                    };
                }
                if ui.add(action_btn("Abandon", RED, !is_busy)).clicked() {
                    action = OverlayAction::Decide {
                        task_id: task.id.clone(),
                        decision: "abandon".into(),
                        reason_code: String::new(),
                        note: None,
                    };
                }
            });
        } else if trace.is_settled() {
            child.add_space(8.0);
            // Use the AI's own finalMessage for completed runs, not a hardcoded "Done".
            let summary = match trace.status.as_str() {
                "completed" => trace
                    .run_message
                    .clone()
                    .unwrap_or_else(|| "Done.".to_string()),
                "abandoned" => trace
                    .closure_reason
                    .clone()
                    .map(|r| format!("Closed — {r}"))
                    .unwrap_or_else(|| "Closed".to_string()),
                _ => trace
                    .closure_reason
                    .clone()
                    .unwrap_or_else(|| "Failed".to_string()),
            };
            // Wrap long summaries — the AI can write multi-sentence completions.
            egui::ScrollArea::vertical()
                .max_height(60.0)
                .auto_shrink([false, true])
                .show(&mut child, |ui| {
                    ui.label(RichText::new(summary).size(12.0).color(MUTED));
                });
            if trace.follow_up_required {
                child.add_space(4.0);
                child.horizontal(|ui| {
                    if ui.add(ghost_btn("Unresolved", true)).clicked() {
                        action = OverlayAction::ShowUnresolved;
                    }
                });
            }
        }

        if !status.is_empty() {
            child.add_space(6.0);
            child.label(RichText::new(status).size(11.0).color(MUTED));
        }
        action
    }

    fn draw_confirm_body(
        &mut self,
        ui: &mut egui::Ui,
        pill_rect: Rect,
        pill_w: f32,
        pill_h: f32,
    ) -> OverlayAction {
        let OverlayState::Confirm { prompt, detail, .. } = &self.state else {
            return OverlayAction::None;
        };
        let prompt = prompt.clone();
        let detail = detail.clone();
        let mut confirmed = false;
        let mut cancelled = false;

        let mut child = Self::body_ui(ui, pill_rect, pill_w, pill_h, 60.0);
        child.label(RichText::new(prompt).size(14.0).color(TEXT));
        if !detail.is_empty() {
            child.add_space(4.0);
            child.label(RichText::new(detail).size(11.5).color(MUTED));
        }
        child.add_space(10.0);
        child.horizontal(|ui| {
            if ui.add(action_btn("Yes", RED, true)).clicked() {
                confirmed = true;
            }
            if ui.add(ghost_btn("No", true)).clicked() {
                cancelled = true;
            }
            ui.label(RichText::new("Y / N").size(10.0).color(MUTED));
        });

        if confirmed {
            self.advance_confirm();
        } else if cancelled {
            self.cancel_closure();
        }
        OverlayAction::None
    }

    /// Reason capture. A chip is always required; the note is optional and can
    /// be spoken instead of typed.
    fn draw_reason_body(
        &mut self,
        ui: &mut egui::Ui,
        pill_rect: Rect,
        pill_w: f32,
        pill_h: f32,
    ) -> OverlayAction {
        let (title, chips, mut sel, dictating) = match &self.state {
            OverlayState::ReasonPrompt {
                title,
                chips,
                selected,
                dictating,
                ..
            } => (title.clone(), chips.clone(), *selected, *dictating),
            _ => return OverlayAction::None,
        };

        let mut commit = false;
        let mut cancel = false;
        let mut dictate = false;

        {
            let mut child = Self::body_ui(ui, pill_rect, pill_w, pill_h, 80.0);
            child.label(RichText::new(format!("{title} — why?")).size(11.0).color(MUTED));
            child.add_space(8.0);

            // Two rows of three so the chips stay readable at notch width.
            for row in chips.chunks(3) {
                let offset = chips
                    .iter()
                    .position(|c| c.code == row[0].code)
                    .unwrap_or(0);
                child.horizontal(|ui| {
                    for (i, chip) in row.iter().enumerate() {
                        let idx = offset + i;
                        let picked = idx == sel;
                        let tint = if picked { ACCENT } else { MUTED };
                        if ui
                            .add(chip_btn(&format!("{}  {}", idx + 1, chip.label), tint, picked))
                            .clicked()
                        {
                            sel = idx;
                        }
                    }
                });
                child.add_space(4.0);
            }

            child.add_space(4.0);
            if let OverlayState::ReasonPrompt { note, .. } = &mut self.state {
                child.add(
                    egui::TextEdit::singleline(note)
                        .desired_width(f32::INFINITY)
                        .hint_text(if dictating {
                            "Listening — speak your reason…"
                        } else {
                            "Optional detail (or press Speak)"
                        }),
                );
            }
            child.add_space(8.0);
            child.horizontal(|ui| {
                if ui.add(action_btn("Confirm", ACCENT, true)).clicked() {
                    commit = true;
                }
                if ui
                    .add(ghost_btn(if dictating { "Listening…" } else { "Speak" }, !dictating))
                    .clicked()
                {
                    dictate = true;
                }
                if ui.add(ghost_btn("Back", true)).clicked() {
                    cancel = true;
                }
            });
        }

        if let OverlayState::ReasonPrompt { selected, .. } = &mut self.state {
            *selected = sel;
        }

        if commit {
            return self.commit_reason();
        }
        if cancel {
            self.cancel_closure();
        }
        if dictate {
            self.set_dictating(true);
            return OverlayAction::Dictate;
        }
        OverlayAction::None
    }

    /// Everything still owed back to the user after the agent stopped.
    fn draw_unresolved_body(
        &mut self,
        ui: &mut egui::Ui,
        pill_rect: Rect,
        pill_w: f32,
        pill_h: f32,
    ) -> OverlayAction {
        let OverlayState::Unresolved { data, status } = &self.state else {
            return OverlayAction::None;
        };
        let data = data.clone();
        let status = status.clone();
        let mut action = OverlayAction::None;

        let mut child = Self::body_ui(ui, pill_rect, pill_w, pill_h, 80.0);
        child.label(
            RichText::new(format!(
                "Unresolved  ·  {} open  ·  {} needing you",
                data.open.len(),
                data.follow_ups.len()
            ))
            .size(11.0)
            .color(MUTED),
        );
        child.add_space(8.0);

        egui::ScrollArea::vertical()
            .max_height(210.0)
            .auto_shrink([false, true])
            .show(&mut child, |ui| {
                for task in &data.open {
                    if ui
                        .add(
                            egui::Button::new(
                                RichText::new(format!("• {}", task.description))
                                    .size(12.0)
                                    .color(TEXT),
                            )
                            .fill(Color32::TRANSPARENT)
                            .stroke(Stroke::NONE),
                        )
                        .clicked()
                    {
                        action = OverlayAction::OpenTask { task: task.clone() };
                    }
                    ui.add_space(3.0);
                }
                if !data.follow_ups.is_empty() {
                    ui.add_space(6.0);
                    ui.label(RichText::new("Closed, still yours").size(10.5).color(MUTED));
                    ui.add_space(4.0);
                    for item in &data.follow_ups {
                        ui.label(RichText::new(format!("• {}", item.description)).size(12.0).color(TEXT));
                        ui.horizontal(|ui| {
                            ui.add_space(10.0);
                            ui.label(
                                RichText::new(format!(
                                    "{} · by {} · {}",
                                    item.reason, item.closed_by, item.closed_at
                                ))
                                .size(10.5)
                                .color(MUTED),
                            );
                        });
                        ui.add_space(4.0);
                    }
                }
                if data.open.is_empty() && data.follow_ups.is_empty() {
                    ui.label(RichText::new("Nothing outstanding.").size(12.0).color(MUTED));
                }
            });

        if !status.is_empty() {
            child.add_space(6.0);
            child.label(RichText::new(status).size(11.0).color(MUTED));
        }
        action
    }

    fn draw_pairing_body(
        &self,
        ui: &mut egui::Ui,
        pill_rect: Rect,
        pill_w: f32,
        pill_h: f32,
    ) -> OverlayAction {
        let OverlayState::Pairing { code, claim_url } = &self.state else {
            return OverlayAction::None;
        };
        let mut action = OverlayAction::None;
        let body = Rect::from_min_size(
            Pos2::new(pill_rect.min.x + 18.0, pill_rect.min.y + PILL_H - 4.0),
            Vec2::new(pill_w - 36.0, (pill_h - PILL_H - 10.0).max(60.0)),
        );
        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(body)
                .layout(egui::Layout::top_down(egui::Align::Min)),
        );
        child.label(
            RichText::new("Pair this desktop")
                .size(11.0)
                .color(MUTED),
        );
        child.add_space(6.0);
        child.label(
            RichText::new(format!("Code  {code}"))
                .size(16.0)
                .color(TEXT),
        );
        child.add_space(6.0);
        child.label(
            RichText::new("Sign in in the browser window that just opened. This notch stays until you finish.")
                .size(12.0)
                .color(TEXT),
        );
        child.add_space(8.0);
        child.horizontal(|ui| {
            if ui.add(action_btn("Open login", ACCENT, true)).clicked() {
                action = OverlayAction::OpenPairUrl {
                    url: claim_url.clone(),
                };
            }
        });
        child.add_space(6.0);
        child.label(RichText::new(claim_url.as_str()).size(10.0).color(MUTED));
        action
    }

    fn accent_color(&self) -> Color32 {
        match &self.state {
            OverlayState::Listening { .. } => RED,
            OverlayState::Processing | OverlayState::Sending => ACCENT,
            OverlayState::Result { ok, .. } => {
                if *ok {
                    GREEN
                } else {
                    RED
                }
            }
            OverlayState::Feedback { .. } | OverlayState::Pairing { .. } => ACCENT,
            OverlayState::Flow { trace, .. } => {
                if trace.steps.iter().any(|s| s.status == "failed") {
                    RED
                } else if trace.status == "completed" {
                    GREEN
                } else {
                    ACCENT
                }
            }
            OverlayState::Confirm { .. } => RED,
            OverlayState::ReasonPrompt { .. } | OverlayState::Unresolved { .. } => ACCENT,
            _ => MUTED,
        }
    }

    fn draw_thumb(&self, ui: &mut egui::Ui) {
        let (rect, _) = ui.allocate_exact_size(Vec2::splat(34.0), Sense::hover());
        let p = ui.painter_at(rect);
        p.rect_filled(rect, CornerRadius::same(8), THUMB_BG);
        draw_mic_icon(&p, rect.center(), MUTED);
    }

    fn draw_center_ring(&mut self, ui: &mut egui::Ui) {
        let (rect, _) = ui.allocate_exact_size(Vec2::splat(28.0), Sense::hover());
        let p = ui.painter_at(rect);
        let c = rect.center();
        let accent = self.accent_color();
        p.circle_stroke(c, 11.0, Stroke::new(1.6_f32, MUTED));
        match self.state {
            OverlayState::Listening { .. } | OverlayState::Processing | OverlayState::Sending => {
                draw_listen_bars(&p, c, self.rms, self.phase, accent, &self.state);
            }
            OverlayState::Result { ok, .. } => {
                if ok {
                    p.line_segment(
                        [Pos2::new(c.x - 3.4, c.y), Pos2::new(c.x - 1.0, c.y + 2.6)],
                        Stroke::new(1.8_f32, GREEN),
                    );
                    p.line_segment(
                        [Pos2::new(c.x - 1.0, c.y + 2.6), Pos2::new(c.x + 4.0, c.y - 3.0)],
                        Stroke::new(1.8_f32, GREEN),
                    );
                }
            }
            _ => {}
        }
    }

    /// Draw the right-side control. Returns `true` if the user clicked the × close button.
    fn draw_right_control(&self, ui: &mut egui::Ui) -> bool {
        let is_close = matches!(
            self.state,
            OverlayState::Result { .. }
                | OverlayState::Feedback { .. }
                | OverlayState::Pairing { .. }
                | OverlayState::Flow { .. }
                | OverlayState::Confirm { .. }
                | OverlayState::ReasonPrompt { .. }
                | OverlayState::Unresolved { .. }
        );

        // Allocate with click sense when showing the × so it actually fires.
        let sense = if is_close { Sense::click() } else { Sense::hover() };
        let (rect, resp) = ui.allocate_exact_size(Vec2::new(22.0, 22.0), sense);
        let p = ui.painter_at(rect);
        let c = rect.center();

        // Highlight on hover when it's the close button.
        let line_color = if is_close && resp.hovered() {
            TEXT
        } else {
            MUTED
        };

        match self.state {
            OverlayState::Listening { .. } => {
                // Pause bars (match the mock).
                let bar = Vec2::new(4.0, 14.0);
                p.rect_filled(
                    Rect::from_center_size(Pos2::new(c.x - 4.5, c.y), bar),
                    CornerRadius::same(1),
                    MUTED,
                );
                p.rect_filled(
                    Rect::from_center_size(Pos2::new(c.x + 4.5, c.y), bar),
                    CornerRadius::same(1),
                    MUTED,
                );
            }
            OverlayState::Result { .. }
            | OverlayState::Feedback { .. }
            | OverlayState::Pairing { .. }
            | OverlayState::Flow { .. }
            | OverlayState::Confirm { .. }
            | OverlayState::ReasonPrompt { .. }
            | OverlayState::Unresolved { .. } => {
                let s = 5.0;
                p.line_segment(
                    [Pos2::new(c.x - s, c.y - s), Pos2::new(c.x + s, c.y + s)],
                    Stroke::new(1.6_f32, line_color),
                );
                p.line_segment(
                    [Pos2::new(c.x + s, c.y - s), Pos2::new(c.x - s, c.y + s)],
                    Stroke::new(1.6_f32, line_color),
                );
            }
            _ => {
                p.circle_filled(c, 2.5, MUTED);
            }
        }

        is_close && resp.clicked()
    }

    // -----------------------------------------------------------------------
    // Session history panel — a compact right-side column that shows every
    // run completed during this session so the user always knows what happened.
    //
    // Layout: a narrow dark pill anchored 12 px from the right edge of the
    // canvas, top-aligned with the main notch.  Each entry is one row:
    //   status glyph  ·  short transcript  ·  step count
    // The panel is only drawn when there is at least one entry and the main
    // notch is visible (alpha > 0).
    // -----------------------------------------------------------------------
    fn draw_session_panel(&self, ui: &mut egui::Ui, canvas: Rect) {
        if self.session_history.is_empty() {
            return;
        }
        if self.alpha < 0.05 {
            return;
        }

        const PANEL_W: f32 = 240.0;
        const ROW_H:   f32 = 38.0;
        const PAD_X:   f32 = 12.0;
        const PAD_Y:   f32 = 8.0;
        const MARGIN:  f32 = 12.0; // gap from right edge of canvas
        const MAX_ROWS: usize = 8;

        let visible = self.session_history.len().min(MAX_ROWS);
        let panel_h = PAD_Y * 2.0 + visible as f32 * ROW_H;

        let panel_x = canvas.max.x - PANEL_W - MARGIN;
        let panel_y = canvas.min.y + PILL_H + 8.0; // just below the notch chrome

        let panel_rect = Rect::from_min_size(
            Pos2::new(panel_x, panel_y),
            Vec2::new(PANEL_W, panel_h),
        );

        let bg = Color32::from_rgba_unmultiplied(
            BG.r(), BG.g(), BG.b(),
            (200.0 * self.alpha) as u8,
        );

        // Background pill
        ui.painter().rect_filled(
            panel_rect,
            CornerRadius::same(14),
            bg,
        );

        // Header label
        let header_rect = Rect::from_min_size(
            Pos2::new(panel_x + PAD_X, panel_y + 4.0),
            Vec2::new(PANEL_W - PAD_X * 2.0, 14.0),
        );
        let mut header_ui = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(header_rect)
                .layout(egui::Layout::left_to_right(egui::Align::Center)),
        );
        header_ui.label(
            RichText::new(format!("Session  ·  {} run{}", visible, if visible == 1 { "" } else { "s" }))
                .size(10.0)
                .color(MUTED),
        );

        // Rows
        for (i, entry) in self.session_history.iter().take(MAX_ROWS).enumerate() {
            let row_y = panel_y + PAD_Y + 14.0 + 2.0 + i as f32 * ROW_H;
            let row_rect = Rect::from_min_size(
                Pos2::new(panel_x + PAD_X, row_y),
                Vec2::new(PANEL_W - PAD_X * 2.0, ROW_H - 4.0),
            );

            let mut row_ui = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(row_rect)
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );

            // Status glyph + short transcript on first line
            row_ui.horizontal(|ui| {
                let (glyph, color) = match entry.status.as_str() {
                    "completed" => ("✔", GREEN),
                    "failed"    => ("✖", RED),
                    "abandoned" => ("—", MUTED),
                    _           => ("•", MUTED),
                };
                ui.label(RichText::new(glyph).size(11.0).color(color).monospace());
                ui.add_space(4.0);

                // Truncate transcript to fit the panel width
                let max_chars = 28usize;
                let t = if entry.transcript.len() > max_chars {
                    format!("{}…", &entry.transcript[..max_chars])
                } else {
                    entry.transcript.clone()
                };
                ui.label(RichText::new(t).size(11.5).color(TEXT));
            });

            // Step count + message on second line
            row_ui.horizontal(|ui| {
                ui.add_space(16.0);
                let sub = if entry.steps > 0 {
                    format!("{} step{}  ·  {}", entry.steps, if entry.steps == 1 { "" } else { "s" },
                        if entry.message.len() > 26 {
                            format!("{}…", &entry.message[..26])
                        } else {
                            entry.message.clone()
                        })
                } else {
                    entry.message.clone()
                };
                ui.label(RichText::new(sub).size(10.0).color(MUTED));
            });
        }
    }
}

fn ghost_btn(label: &str, enabled: bool) -> egui::Button<'_> {
    egui::Button::new(RichText::new(label).size(12.0).color(TEXT))
        .fill(THUMB_BG)
        .stroke(Stroke::new(1.0_f32, Color32::from_rgb(0x33, 0x33, 0x33)))
        .corner_radius(CornerRadius::same(8))
        .min_size(Vec2::new(64.0, 28.0))
        .sense(if enabled { Sense::click() } else { Sense::hover() })
}

/// Reason chip. The selected one fills in; the rest stay outlines.
fn chip_btn(label: &str, tint: Color32, picked: bool) -> egui::Button<'_> {
    egui::Button::new(RichText::new(label).size(11.5).color(if picked { TEXT } else { MUTED }))
        .fill(if picked {
            tint.gamma_multiply(0.30)
        } else {
            THUMB_BG
        })
        .stroke(Stroke::new(
            1.0_f32,
            if picked {
                tint.gamma_multiply(0.7)
            } else {
                Color32::from_rgb(0x33, 0x33, 0x33)
            },
        ))
        .corner_radius(CornerRadius::same(9))
        .min_size(Vec2::new(96.0, 26.0))
}

/// Status marker for one row of the agent flow.
fn step_glyph(status: &str) -> (&'static str, Color32) {
    match status {
        "succeeded" => ("✔", GREEN),
        "failed" => ("✖", RED),
        "running" => ("⏵", ACCENT),
        "awaiting_input" => ("?", ACCENT),
        "skipped" => ("–", MUTED),
        "abandoned" => ("✖", MUTED),
        _ => ("•", MUTED),
    }
}

fn action_btn(label: &str, tint: Color32, enabled: bool) -> egui::Button<'_> {
    egui::Button::new(RichText::new(label).size(12.0).color(TEXT))
        .fill(tint.gamma_multiply(0.28))
        .stroke(Stroke::new(1.0_f32, tint.gamma_multiply(0.55)))
        .corner_radius(CornerRadius::same(8))
        .min_size(Vec2::new(78.0, 28.0))
        .sense(if enabled { Sense::click() } else { Sense::hover() })
}

/// Classic capsule mic: head, U-yoke, stem, stand.
fn draw_mic_icon(p: &egui::Painter, c: Pos2, col: Color32) {
    let stroke = Stroke::new(1.6_f32, col);
    // Capsule head
    p.rect_filled(
        Rect::from_center_size(Pos2::new(c.x, c.y - 4.0), Vec2::new(9.0, 13.0)),
        CornerRadius::same(5),
        col,
    );
    // Yoke (U under the capsule)
    let yoke_r = 7.5_f32;
    let yoke_c = Pos2::new(c.x, c.y - 1.0);
    let n = 12;
    let mut prev = None;
    for i in 0..=n {
        let t = std::f32::consts::PI * (i as f32 / n as f32); // 0..π, bottom half
        let pt = Pos2::new(yoke_c.x + yoke_r * t.cos(), yoke_c.y + yoke_r * t.sin());
        if let Some(a) = prev {
            p.line_segment([a, pt], stroke);
        }
        prev = Some(pt);
    }
    // Stem + stand
    p.line_segment(
        [Pos2::new(c.x, c.y + 6.5), Pos2::new(c.x, c.y + 10.5)],
        stroke,
    );
    p.line_segment(
        [Pos2::new(c.x - 5.0, c.y + 10.5), Pos2::new(c.x + 5.0, c.y + 10.5)],
        stroke,
    );
}

fn draw_listen_bars(
    p: &egui::Painter,
    c: Pos2,
    rms: f32,
    phase: f32,
    color: Color32,
    state: &OverlayState,
) {
    let n = 5usize;
    let gap = 2.4_f32;
    let bw = 1.8_f32;
    let total = n as f32 * bw + (n - 1) as f32 * gap;
    let sx = c.x - total * 0.5;
    let max_h = 12.0_f32;
    let level = (rms * 5.0).clamp(0.0, 1.0);
    for i in 0..n {
        let t = match state {
            OverlayState::Listening { .. } => {
                let bias = 1.0 - ((i as f32 - 2.0) / 2.4).abs() * 0.35;
                let jitter = ((phase + i as f32 * 1.25) * 2.6).sin() * 0.08;
                (level * bias + jitter).clamp(0.12, 1.0)
            }
            _ => ((phase * 1.15 + i as f32 * 0.7).sin() * 0.5 + 0.5).clamp(0.15, 1.0),
        };
        let h = 3.0 + t * (max_h - 3.0);
        let x = sx + i as f32 * (bw + gap);
        let a = (140.0 + t * 115.0) as u8;
        p.rect_filled(
            Rect::from_center_size(Pos2::new(x + bw * 0.5, c.y), Vec2::new(bw, h)),
            CornerRadius::same(1),
            Color32::from_rgba_premultiplied(color.r(), color.g(), color.b(), a),
        );
    }
}

fn draw_notch(painter: &egui::Painter, rect: Rect, fill: Color32) {
    let r = BOTTOM_R.min(rect.height() * 0.5);
    let body = Rect::from_min_max(
        Pos2::new(rect.min.x, rect.min.y),
        Pos2::new(rect.max.x, rect.max.y),
    );

    // Soft drop under the rounded bottom so it reads as hanging from the bezel.
    for i in 1..=5u8 {
        let e = i as f32 * 2.0;
        painter.rect_filled(
            body.translate(Vec2::new(0.0, 1.0)).expand(e),
            CornerRadius {
                nw: 0,
                ne: 0,
                sw: (r + e) as u8,
                se: (r + e) as u8,
            },
            Color32::from_rgba_unmultiplied(0, 0, 0, (18 / i) as u8),
        );
    }

    painter.rect_filled(
        body,
        CornerRadius {
            nw: 0,
            ne: 0,
            sw: r as u8,
            se: r as u8,
        },
        fill,
    );

    fill_left_flare(painter, rect.min, FLARE, fill);
    fill_right_flare(painter, Pos2::new(rect.max.x, rect.min.y), FLARE, fill);
}

/// Square-minus-quarter-circle at the top-left, fanned from the inner corner.
fn fill_left_flare(painter: &egui::Painter, origin: Pos2, r: f32, fill: Color32) {
    let cx = origin.x - r;
    let cy = origin.y + r;
    let mut prev = Pos2::new(origin.x - r, origin.y);
    let n = 18;
    for i in 1..=n {
        let t = i as f32 / n as f32 * std::f32::consts::FRAC_PI_2;
        let pt = Pos2::new(cx + r * t.sin(), cy - r * t.cos());
        painter.add(Shape::convex_polygon(
            vec![origin, prev, pt],
            fill,
            Stroke::NONE,
        ));
        prev = pt;
    }
}

fn fill_right_flare(painter: &egui::Painter, origin: Pos2, r: f32, fill: Color32) {
    let cx = origin.x + r;
    let cy = origin.y + r;
    let mut prev = Pos2::new(origin.x + r, origin.y);
    let n = 18;
    for i in 1..=n {
        let t = i as f32 / n as f32 * std::f32::consts::FRAC_PI_2;
        let pt = Pos2::new(cx - r * t.sin(), cy - r * t.cos());
        painter.add(Shape::convex_polygon(
            vec![origin, prev, pt],
            fill,
            Stroke::NONE,
        ));
        prev = pt;
    }
}
