//! Top-of-screen notch overlay (desktop Dynamic Island).
//!
//! The window is full monitor width and sits at y=0. Only the black notch is
//! painted — the rest of the viewport stays transparent. The silhouette hangs
//! from the top bezel: concave flares at the top corners, stadium rounding
//! along the bottom.

use egui::{self, Color32, CornerRadius, Pos2, Rect, RichText, Sense, Shape, Stroke, Vec2};

/// Collapsed notch height (logical px), not counting the top-edge flares.
pub const PILL_H: f32 = 56.0;
/// Notch width when idle / listening.
pub const PILL_W_IDLE: f32 = 420.0;
/// Extra height added when the transcript result is shown.
pub const PILL_H_RESULT_EXTRA: f32 = 200.0;
/// Window height when a result is visible.
pub const PILL_H_RESULT: f32 = PILL_H + PILL_H_RESULT_EXTRA;
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
    pub fn show_result(&mut self, text: String, ok: bool, now: f64) {
        self.state = OverlayState::Result { text, ok };
        self.dismiss_at = Some(now + 8.0);
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
            OverlayState::Result { .. } => PILL_H_RESULT,
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

    /// Draw everything. Returns true if the overlay should be dismissed.
    pub fn ui(&mut self, ctx: &egui::Context, ui: &mut egui::Ui) -> bool {
        let mut should_dismiss = false;
        // Center in the real window, not a guessed monitor width.
        let canvas = ui.max_rect();
        let sw = canvas.width().max(1.0);

        let has_result = matches!(self.state, OverlayState::Result { .. });
        let pill_w = if has_result {
            (sw * 0.48).max(PILL_W_IDLE).min(sw - 48.0)
        } else {
            PILL_W_IDLE.min(sw - 48.0)
        };
        let pill_h = if has_result {
            PILL_H_RESULT.min(canvas.height())
        } else {
            PILL_H
        };
        let pill_x = canvas.min.x + (sw - pill_w) * 0.5;
        let pill_rect = Rect::from_min_size(Pos2::new(pill_x, canvas.min.y), Vec2::new(pill_w, pill_h));

        let painter = ui.painter();
        let bg = Color32::from_rgba_unmultiplied(BG.r(), BG.g(), BG.b(), (255.0 * self.alpha) as u8);

        draw_notch(painter, pill_rect, bg);

        let pill_resp = ui.allocate_rect(pill_rect, Sense::click());
        if pill_resp.clicked() {
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
            let caption = if ok { "Transcript" } else { "Nothing heard" };
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

        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) || should_dismiss {
            self.dismiss();
        }
        should_dismiss
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
            OverlayState::Result { .. } => {
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
