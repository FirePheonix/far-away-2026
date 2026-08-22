//! Top-of-screen notch overlay (desktop Dynamic Island).
//!
//! The window is full monitor width and sits at y=0. Only the black notch is
//! painted — the rest of the viewport stays transparent. The silhouette hangs
//! from the top bezel: concave flares at the top corners, stadium rounding
//! along the bottom.

use crate::api::PendingTask;
use egui::{self, Color32, CornerRadius, Pos2, Rect, RichText, Sense, Shape, Stroke, Vec2};

/// Collapsed notch height (logical px), not counting the top-edge flares.
pub const PILL_H: f32 = 56.0;
/// Notch width when idle / listening.
pub const PILL_W_IDLE: f32 = 420.0;
/// Extra height added when the transcript result is shown.
pub const PILL_H_RESULT_EXTRA: f32 = 200.0;
/// Extra height for the human-feedback task panel.
pub const PILL_H_FEEDBACK_EXTRA: f32 = 250.0;
/// Window height when a result is visible.
pub const PILL_H_RESULT: f32 = PILL_H + PILL_H_RESULT_EXTRA;
/// Window height when a pending task needs a decision.
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
    Pairing { code: String, claim_url: String },
}

#[derive(Debug, Clone, Default)]
pub enum OverlayAction {
    #[default]
    None,
    Skip { task_id: String },
    Abandon { task_id: String },
    Change { task_id: String, instruction: String },
    OpenPairUrl { url: String },
}

pub struct Overlay {
    pub state: OverlayState,
    pub rms: f32,
    pub alpha: f32,
    pub screen_w: f32,
    pub max_scroll_h: f32,
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
            dismiss_at: None,
            phase: 0.0,
        }
    }
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
        if let OverlayState::Feedback {
            busy: b, status: s, ..
        } = &mut self.state
        {
            *b = busy;
            *s = status.into();
        }
    }
    pub fn dismiss(&mut self) {
        self.state = OverlayState::Hidden;
        self.dismiss_at = None;
    }
    pub fn is_visible(&self) -> bool {
        !matches!(self.state, OverlayState::Hidden) || self.alpha > 0.01
    }
    pub fn desired_height(&self) -> f32 {
        match self.state {
            OverlayState::Result { .. } | OverlayState::Pairing { .. } => PILL_H_RESULT,
            OverlayState::Feedback { changing, .. } => {
                if changing {
                    PILL_H_FEEDBACK + 40.0
                } else {
                    PILL_H_FEEDBACK
                }
            }
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
            OverlayState::Feedback { .. } | OverlayState::Pairing { .. }
        );
        // Center in the real window, not a guessed monitor width.
        let canvas = ui.max_rect();
        let sw = canvas.width().max(1.0);

        let expanded = matches!(
            self.state,
            OverlayState::Result { .. }
                | OverlayState::Feedback { .. }
                | OverlayState::Pairing { .. }
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
            self.draw_right_control(&mut right_ui);
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
        if matches!(self.state, OverlayState::Pairing { .. }) {
            if let OverlayAction::OpenPairUrl { url } = self.draw_pairing_body(ui, pill_rect, pill_w, pill_h)
            {
                action = OverlayAction::OpenPairUrl { url };
            }
        }

        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            if let OverlayState::Feedback { changing, .. } = &mut self.state {
                if *changing {
                    *changing = false;
                } else {
                    should_dismiss = true;
                }
            } else {
                should_dismiss = true;
            }
        }
        if should_dismiss {
            self.dismiss();
        }
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
        } else {
            child.horizontal(|ui| {
                if ui.add(action_btn("Abandon", RED, !is_busy)).clicked() {
                    action = OverlayAction::Abandon {
                        task_id: task.id.clone(),
                    };
                }
                if ui.add(action_btn("Skip", MUTED, !is_busy)).clicked() {
                    action = OverlayAction::Skip {
                        task_id: task.id.clone(),
                    };
                }
                if ui.add(action_btn("Change", ACCENT, !is_busy)).clicked() {
                    *changing = true;
                }
            });
        }

        if !status.is_empty() {
            child.add_space(6.0);
            child.label(RichText::new(status.as_str()).size(11.0).color(MUTED));
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

    fn draw_right_control(&self, ui: &mut egui::Ui) {
        let (rect, _) = ui.allocate_exact_size(Vec2::new(22.0, 22.0), Sense::hover());
        let p = ui.painter_at(rect);
        let c = rect.center();
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
            | OverlayState::Pairing { .. } => {
                // Close affordance
                let s = 5.0;
                p.line_segment(
                    [Pos2::new(c.x - s, c.y - s), Pos2::new(c.x + s, c.y + s)],
                    Stroke::new(1.6_f32, MUTED),
                );
                p.line_segment(
                    [Pos2::new(c.x + s, c.y - s), Pos2::new(c.x - s, c.y + s)],
                    Stroke::new(1.6_f32, MUTED),
                );
            }
            _ => {
                p.circle_filled(c, 2.5, MUTED);
            }
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
