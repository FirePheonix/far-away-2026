//! Dynamic-Island-style notch overlay.
//!
//! The egui window is full screen width, ~56px tall (collapsed) or taller
//! (expanded result). Background is fully transparent — only the pill shape
//! is drawn. This means positioning is trivial: x=0, y=0, width=screen_width.
//! No centering math, no clipping.

use egui::{self, Color32, CornerRadius, Pos2, Rect, RichText, Sense, Stroke, Vec2};

/// Collapsed pill height (logical px).
pub const PILL_H: f32 = 52.0;
/// Pill width when collapsed.
pub const PILL_W_IDLE: f32 = 480.0;
/// Extra height added when result is shown (scroll area lives here).
pub const PILL_H_RESULT_EXTRA: f32 = 220.0;
/// The window height when result is visible.
pub const PILL_H_RESULT: f32 = PILL_H + PILL_H_RESULT_EXTRA;

// ── Palette ──────────────────────────────────────────────────────────────────
const BG: Color32       = Color32::from_rgb(0x0A, 0x0A, 0x0A);
const BG_INNER: Color32 = Color32::from_rgb(0x14, 0x15, 0x15);
const BORDER: Color32   = Color32::from_rgb(0x2A, 0x2A, 0x2A);
const TEXT: Color32     = Color32::from_rgb(0xED, 0xE8, 0xDF);
const SUBTEXT: Color32  = Color32::from_rgb(0x66, 0x66, 0x66);
const ACCENT: Color32   = Color32::from_rgb(0x1B, 0xB9, 0xCE);
const RED: Color32      = Color32::from_rgb(0xC0, 0x7A, 0x7A);
const GREEN: Color32    = Color32::from_rgb(0x7D, 0xA8, 0x88);

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
    /// Screen width in logical pixels — set by sync_viewport each frame.
    pub screen_w: f32,
    /// Max height available for the scroll area — set by sync_viewport.
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
            max_scroll_h: 180.0,
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
        let target = if matches!(self.state, OverlayState::Hidden) { 0.0 } else { 1.0 };
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
            if now >= t { self.dismiss(); }
        }
    }

    /// Draw everything. Returns true if the overlay should be dismissed.
    pub fn ui(&mut self, ctx: &egui::Context, ui: &mut egui::Ui) -> bool {
        let mut should_dismiss = false;
        let sw = self.screen_w;

        // ── Pill geometry ─────────────────────────────────────────────────────
        let has_result = matches!(self.state, OverlayState::Result { .. });
        let pill_w = if has_result { (sw * 0.55).max(PILL_W_IDLE).min(sw - 40.0) } else { PILL_W_IDLE.min(sw - 40.0) };
        let pill_h = if has_result { PILL_H_RESULT.min(ui.available_height()) } else { PILL_H };
        let pill_x = (sw - pill_w) * 0.5;
        let pill_rect = Rect::from_min_size(
            Pos2::new(pill_x, 0.0),
            Vec2::new(pill_w, pill_h),
        );
        let radius = pill_h.min(pill_w) * 0.5; // fully rounded ends when collapsed

        let painter = ui.painter();

        // Shadow / glow
        let accent_col = self.accent_color();
        let glow = accent_col.gamma_multiply(0.12 * self.alpha);
        for i in 1..=6u8 {
            let expand = i as f32 * 2.5;
            let alpha_mul = (0.06 - i as f32 * 0.008).max(0.0);
            painter.rect_filled(
                pill_rect.expand(expand),
                CornerRadius::same((radius + expand) as u8),
                glow.gamma_multiply(alpha_mul / 0.06),
            );
        }

        // Main pill background
        painter.rect_filled(pill_rect, CornerRadius::same(radius as u8), BG);

        // Thin border
        painter.rect_stroke(
            pill_rect,
            CornerRadius::same(radius as u8),
            Stroke::new(1.0_f32, BORDER),
            egui::StrokeKind::Outside,
        );

        // ── Allocate pill area for widgets ────────────────────────────────────
        let pill_resp = ui.allocate_rect(pill_rect, Sense::click());
        if pill_resp.clicked() { should_dismiss = true; }

        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(pill_rect.shrink2(Vec2::new(16.0, 0.0)))
                .layout(egui::Layout::left_to_right(egui::Align::Center)),
        );

        // ── Collapsed bar: icon · status · bars ──────────────────────────────
        child.set_height(PILL_H);
        child.horizontal(|ui| {
            ui.set_height(PILL_H);

            // Left: animated icon
            self.draw_icon(ui, accent_col);
            ui.add_space(10.0);

            // Center: status label
            let status = self.status_text();
            ui.label(RichText::new(status).size(13.5).color(TEXT));

            // Right: waveform bars + dismiss ×
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                // × dismiss
                let x_btn = ui.add(
                    egui::Button::new(RichText::new("×").size(15.0).color(SUBTEXT))
                        .fill(Color32::TRANSPARENT)
                        .frame(false)
                        .min_size(Vec2::splat(28.0)),
                );
                if x_btn.clicked() { should_dismiss = true; }
                ui.add_space(4.0);
                self.draw_bars(ui, accent_col);
            });
        });

        // ── Expanded result body ──────────────────────────────────────────────
        if let OverlayState::Result { text, ok } = &self.state.clone() {
            let ok = *ok;
            let text = text.clone();
            let mut child2 = ui.new_child(
                egui::UiBuilder::new()
                    .max_rect(Rect::from_min_size(
                        Pos2::new(pill_rect.min.x + 16.0, pill_rect.min.y + PILL_H),
                        Vec2::new(pill_w - 32.0, pill_h - PILL_H),
                    ))
                    .layout(egui::Layout::top_down(egui::Align::Min)),
            );

            // Separator
            let sep_col = if ok { GREEN } else { RED };
            let (sr, _) = child2.allocate_exact_size(
                Vec2::new(child2.available_width(), 1.0), Sense::hover(),
            );
            child2.painter().rect_filled(sr, 0.0, sep_col.gamma_multiply(0.4));
            child2.add_space(8.0);

            // "Heard …" preview
            if !text.is_empty() {
                let preview = if text.chars().count() > 80 {
                    let end = text.char_indices().nth(79).map(|(i,_)| i).unwrap_or(text.len());
                    format!("\"{}…\"", &text[..end])
                } else {
                    format!("\"{}\"", text)
                };
                child2.label(RichText::new(format!("Heard  {preview}")).size(11.0).color(SUBTEXT));
                child2.add_space(6.0);
            }

            // Scrollable transcript box
            egui::Frame::NONE
                .fill(BG_INNER)
                .stroke(Stroke::new(1.0_f32, BORDER))
                .corner_radius(CornerRadius::same(10))
                .inner_margin(10.0)
                .show(&mut child2, |ui| {
                    egui::ScrollArea::vertical()
                        .max_height(self.max_scroll_h)
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            ui.label(RichText::new(&text).size(12.5).color(TEXT));
                        });
                });

            child2.add_space(6.0);

            // Bottom hint
            child2.horizontal(|ui| {
                if ok {
                    ui.label(RichText::new("✓  copied").size(10.0).color(GREEN.gamma_multiply(0.8)));
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(RichText::new("Esc · click to close").size(10.0).color(SUBTEXT));
                });
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
            OverlayState::Result { ok, .. } => if *ok { GREEN } else { RED },
            _ => SUBTEXT,
        }
    }

    fn status_text(&self) -> &str {
        match &self.state {
            OverlayState::Hidden => "",
            OverlayState::Listening { mode } => match mode {
                RecordMode::Ocr => "OCR  ·  press again to stop",
                RecordMode::Command => "Command  ·  press again to stop",
            },
            OverlayState::Processing => "Transcribing…",
            OverlayState::Sending => "Sending…",
            OverlayState::Result { ok, .. } => if *ok { "Done" } else { "Nothing heard" },
        }
    }

    fn draw_icon(&mut self, ui: &mut egui::Ui, color: Color32) {
        let (rect, _) = ui.allocate_exact_size(Vec2::splat(22.0), Sense::hover());
        let p = ui.painter_at(rect);
        let cx = rect.center();
        match self.state {
            OverlayState::Listening { .. } => {
                let pulse = (self.phase * 1.4).sin() * 0.5 + 0.5;
                let r = 4.0 + pulse * 4.0;
                let a = ((0.55 + pulse * 0.45) * 255.0) as u8;
                p.circle_filled(cx, r, Color32::from_rgba_premultiplied(color.r(), color.g(), color.b(), a));
            }
            OverlayState::Processing | OverlayState::Sending => {
                for i in 0..3 {
                    let angle = self.phase + i as f32 * std::f32::consts::TAU / 3.0;
                    let a = (100.0 + ((angle * 0.5).sin() * 0.5 + 0.5) * 155.0) as u8;
                    p.circle_filled(
                        egui::pos2(cx.x + angle.cos() * 5.0, cx.y + angle.sin() * 5.0),
                        2.5,
                        Color32::from_rgba_premultiplied(color.r(), color.g(), color.b(), a),
                    );
                }
            }
            OverlayState::Result { ok, .. } => {
                p.circle_filled(cx, 7.0, color.gamma_multiply(0.2));
                p.circle_stroke(cx, 7.0, Stroke::new(1.5_f32, color));
                if ok {
                    p.line_segment([egui::pos2(cx.x-3.0, cx.y), egui::pos2(cx.x-1.0, cx.y+2.5)], Stroke::new(1.8_f32, GREEN));
                    p.line_segment([egui::pos2(cx.x-1.0, cx.y+2.5), egui::pos2(cx.x+3.5, cx.y-3.0)], Stroke::new(1.8_f32, GREEN));
                }
            }
            _ => { p.circle_filled(cx, 4.0, color.gamma_multiply(0.4)); }
        }
    }

    fn draw_bars(&mut self, ui: &mut egui::Ui, color: Color32) {
        let (rect, _) = ui.allocate_exact_size(Vec2::new(44.0, 30.0), Sense::hover());
        let p = ui.painter_at(rect);
        let rms = (self.rms * 5.0).clamp(0.0, 1.0);
        let bw = 4.0_f32;
        let gap = 3.5_f32;
        let n = 5usize;
        let total = n as f32 * bw + (n-1) as f32 * gap;
        let sx = rect.left() + (rect.width() - total) * 0.5;
        for i in 0..n {
            let t = match self.state {
                OverlayState::Listening { .. } => {
                    let bias = 1.0 - ((i as f32 - 2.0)/2.5).abs() * 0.3;
                    let jitter = ((self.phase + i as f32 * 1.3)*2.8).sin() * 0.05;
                    (rms * bias + jitter).clamp(0.05, 1.0)
                }
                OverlayState::Processing | OverlayState::Sending => {
                    ((self.phase * 1.1 + i as f32 * 0.7).sin() * 0.5 + 0.5).clamp(0.1, 1.0)
                }
                _ => 0.1,
            };
            let mh = rect.height() - 4.0;
            let h = 3.0 + t * (mh - 3.0);
            let x = sx + i as f32 * (bw + gap);
            let y = rect.center().y - h * 0.5;
            let a = (130.0 + t * 125.0) as u8;
            p.rect_filled(
                Rect::from_min_size(egui::pos2(x, y), Vec2::new(bw, h)),
                CornerRadius::same(2),
                Color32::from_rgba_premultiplied(color.r(), color.g(), color.b(), a),
            );
        }
    }
}
