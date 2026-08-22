//! Floating overlay UI state rendered inside the egui window.

use egui::{self, Color32, CornerRadius, Frame, RichText, Sense, Stroke, Vec2};

pub const CARD_W: f32 = 600.0;
pub const CARD_H: f32 = 72.0;
/// Minimum result card height (before scroll area expands to fill available screen space).
pub const CARD_H_RESULT: f32 = 268.0;
/// Fixed chrome height: everything in the result card except the scroll area itself.
/// header(48) + space(10) + sep(9) + heard(24) + frame_margins(24) + space(6) + hint(20) + outer_margins(26)
pub const CARD_CHROME_H: f32 = 167.0;

// ── Palette ─────────────────────────────────────────────────────────────────
const BG: Color32 = Color32::from_rgb(0x0D, 0x0E, 0x0E);
const BG_INNER: Color32 = Color32::from_rgb(0x13, 0x14, 0x14);
const BORDER: Color32 = Color32::from_rgb(0x28, 0x28, 0x28);
const TEXT: Color32 = Color32::from_rgb(0xE8, 0xDC, 0xC8);
const SUBTEXT: Color32 = Color32::from_rgb(0x72, 0x72, 0x72);
const ACCENT: Color32 = Color32::from_rgb(0x1B, 0xB9, 0xCE);
const RED: Color32 = Color32::from_rgb(0xC0, 0x7A, 0x7A);
const GREEN: Color32 = Color32::from_rgb(0x7D, 0xA8, 0x88);
const DISMISS_BG: Color32 = Color32::from_rgba_premultiplied(0xFF, 0xFF, 0xFF, 12);
const DISMISS_HOVER: Color32 = Color32::from_rgba_premultiplied(0xFF, 0xFF, 0xFF, 28);

/// Which recording mode is active for this session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordMode {
    /// Ctrl+Shift+Space — copy transcript to clipboard.
    Ocr,
    /// Ctrl+Shift+Enter — send transcript to backend as a command.
    Command,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OverlayState {
    Hidden,
    Listening { mode: RecordMode },
    Processing,
    /// Command mode: waiting for backend HTTP response.
    Sending,
    Result { text: String, ok: bool },
}

pub struct Overlay {
    pub state: OverlayState,
    pub rms: f32,
    pub alpha: f32,
    /// Maximum height for the transcript scroll area, computed each frame by
    /// sync_viewport based on available screen space.
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
            max_scroll_h: 100.0,
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
        self.dismiss_at = Some(now + 7.0);
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
            OverlayState::Result { .. } => CARD_H_RESULT,
            _ => CARD_H,
        }
    }

    pub fn tick(&mut self, now: f64, dt: f32) {
        let target = if matches!(self.state, OverlayState::Hidden) { 0.0 } else { 1.0 };
        // Faster fade-in, gentler fade-out
        let step = if self.alpha < target { 0.18 } else { 0.09 };
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

    pub fn ui(&mut self, ctx: &egui::Context, ui: &mut egui::Ui) -> bool {
        let mut should_dismiss = false;

        let (status, accent, border_color, show_result) = match &self.state {
            OverlayState::Hidden => ("", SUBTEXT, BORDER, None),
            OverlayState::Listening { mode } => {
                let label = match mode {
                    RecordMode::Ocr => "OCR  ·  Ctrl+Shift+Space to stop",
                    RecordMode::Command => "Command  ·  Ctrl+Shift+Enter to stop",
                };
                (label, RED, RED, None)
            }
            OverlayState::Processing => ("Transcribing…", ACCENT, ACCENT, None),
            OverlayState::Sending => ("Sending command…", ACCENT, ACCENT, None),
            OverlayState::Result { text, ok } => {
                let label = if *ok { "Done" } else { "Nothing heard" };
                let color = if *ok { GREEN } else { RED };
                let bc = if *ok { GREEN } else { RED };
                (label, color, bc, Some((text.clone(), *ok)))
            }
        };

        // Outer glow-border frame
        Frame::NONE
            .fill(border_color.gamma_multiply(0.35))
            .corner_radius(CornerRadius::same(20))
            .inner_margin(1.0)
            .show(ui, |ui| {
                // Main dark body
                Frame::NONE
                    .fill(BG)
                    .corner_radius(CornerRadius::same(18))
                    .inner_margin(egui::Margin::symmetric(18, 12))
                    .show(ui, |ui| {
                        ui.set_min_width(CARD_W - 6.0);

                        // ── Header row ────────────────────────────────────
                        ui.horizontal(|ui| {
                            // Animated dot / spinner icon
                            self.draw_icon(ui, accent);
                            ui.add_space(10.0);
                            ui.label(RichText::new(status).size(14.0).color(TEXT));

                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    // Dismiss × button
                                    let btn = ui.add(
                                        egui::Button::new(
                                            RichText::new("×").size(16.0).color(SUBTEXT),
                                        )
                                        .fill(DISMISS_BG)
                                        .corner_radius(CornerRadius::same(6))
                                        .min_size(Vec2::new(24.0, 24.0)),
                                    );
                                    if btn.hovered() {
                                        // Re-draw with hover bg (egui Button handles this via
                                        // visuals, but we override fill — so paint manually)
                                        ui.painter().rect_filled(
                                            btn.rect,
                                            CornerRadius::same(6),
                                            DISMISS_HOVER,
                                        );
                                    }
                                    if btn.clicked() {
                                        should_dismiss = true;
                                    }
                                    ui.add_space(6.0);
                                    self.draw_bars(ui, accent);
                                },
                            );
                        });

                        // ── Result body ───────────────────────────────────
                        if let Some((text, ok)) = show_result {
                            ui.add_space(10.0);

                            // Thin separator with accent tint
                            let sep_color = if ok {
                                GREEN.gamma_multiply(0.5)
                            } else {
                                RED.gamma_multiply(0.5)
                            };
                            let (sep_rect, _) = ui.allocate_exact_size(
                                Vec2::new(ui.available_width(), 1.0),
                                Sense::hover(),
                            );
                            ui.painter().rect_filled(sep_rect, 0.0, sep_color);
                            ui.add_space(8.0);

                            // "Heard: …" preview line (only when text present)
                            if !text.is_empty() {
                                let preview = if text.len() > 80 {
                                    format!("\"{}…\"", &text[..79])
                                } else {
                                    format!("\"{}\"", text)
                                };
                                ui.label(
                                    RichText::new(format!("Heard  {preview}"))
                                        .size(11.5)
                                        .color(SUBTEXT),
                                );
                                ui.add_space(6.0);
                            }

                            // Scrollable result box — height fills whatever the window allows
                            Frame::NONE
                                .fill(BG_INNER)
                                .stroke(Stroke::new(1.0_f32, BORDER))
                                .corner_radius(CornerRadius::same(10))
                                .inner_margin(12.0)
                                .show(ui, |ui| {
                                    ui.set_min_width(CARD_W - 52.0);
                                    egui::ScrollArea::vertical()
                                        .max_height(self.max_scroll_h)
                                        .auto_shrink([false, false])
                                        .show(ui, |ui| {
                                            ui.label(
                                                RichText::new(&text).size(13.0).color(TEXT),
                                            );
                                        });
                                });

                            ui.add_space(6.0);

                            // Bottom hint row
                            ui.horizontal(|ui| {
                                if ok {
                                    ui.label(
                                        RichText::new("✓  copied to clipboard")
                                            .size(10.5)
                                            .color(GREEN.gamma_multiply(0.8)),
                                    );
                                }
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        ui.label(
                                            RichText::new("Esc  ·  click × to close")
                                                .size(10.5)
                                                .color(SUBTEXT),
                                        );
                                    },
                                );
                            });
                        }
                    });
            });

        // Escape to dismiss
        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) || should_dismiss {
            self.dismiss();
        }

        should_dismiss
    }

    /// Small animated icon to the left of the status text.
    fn draw_icon(&mut self, ui: &mut egui::Ui, color: Color32) {
        let size = Vec2::splat(20.0);
        let (rect, _) = ui.allocate_exact_size(size, Sense::hover());
        let painter = ui.painter_at(rect);
        let cx = rect.center();

        match self.state {
            OverlayState::Listening { .. } => {
                // Pulsing circle
                let pulse = ((self.phase * 1.5).sin() * 0.5 + 0.5) as f32;
                let r = 5.0 + pulse * 3.0;
                let alpha = ((0.6 + pulse * 0.4) * 255.0) as u8;
                painter.circle_filled(cx, r, Color32::from_rgba_premultiplied(
                    color.r(), color.g(), color.b(), alpha,
                ));
            }
            OverlayState::Processing | OverlayState::Sending => {
                // Spinning arc (3 dots orbiting)
                for i in 0..3 {
                    let angle = self.phase + (i as f32) * std::f32::consts::TAU / 3.0;
                    let px = cx.x + angle.cos() * 5.5;
                    let py = cx.y + angle.sin() * 5.5;
                    let fade = ((angle * 0.3).sin() * 0.5 + 0.5) as f32;
                    let a = (80.0 + fade * 175.0) as u8;
                    painter.circle_filled(
                        egui::pos2(px, py),
                        2.2,
                        Color32::from_rgba_premultiplied(color.r(), color.g(), color.b(), a),
                    );
                }
            }
            OverlayState::Result { ok, .. } => {
                // Static checkmark or X
                if ok {
                    painter.circle_filled(cx, 6.0, GREEN.gamma_multiply(0.25));
                    painter.circle_stroke(cx, 6.0, Stroke::new(1.5_f32, GREEN));
                    // Simple check mark
                    let p1 = egui::pos2(cx.x - 3.0, cx.y);
                    let p2 = egui::pos2(cx.x - 1.0, cx.y + 2.5);
                    let p3 = egui::pos2(cx.x + 3.5, cx.y - 3.0);
                    painter.line_segment([p1, p2], Stroke::new(1.8_f32, GREEN));
                    painter.line_segment([p2, p3], Stroke::new(1.8_f32, GREEN));
                } else {
                    painter.circle_filled(cx, 6.0, RED.gamma_multiply(0.2));
                    painter.circle_stroke(cx, 6.0, Stroke::new(1.5_f32, RED));
                }
            }
            _ => {
                painter.circle_filled(cx, 4.0, color.gamma_multiply(0.5));
            }
        }
    }

    fn draw_bars(&mut self, ui: &mut egui::Ui, color: Color32) {
        let (rect, _resp) = ui.allocate_exact_size(Vec2::new(46.0, 32.0), Sense::hover());
        let painter = ui.painter_at(rect);
        let rms = (self.rms * 5.0).clamp(0.0, 1.0);
        let bar_w = 4.0;
        let bar_gap = 4.0;
        let n = 5usize;
        let total_w = n as f32 * bar_w + (n - 1) as f32 * bar_gap;
        let start_x = rect.left() + (rect.width() - total_w) * 0.5;

        for i in 0..n {
            let t = match self.state {
                OverlayState::Listening { .. } => {
                    let jitter = ((self.phase + i as f32 * 1.3) * 2.8).sin() * 0.05;
                    let center_bias = 1.0 - ((i as f32 - 2.0) / 2.5).abs() * 0.3;
                    (rms * center_bias + jitter).clamp(0.05, 1.0)
                }
                OverlayState::Processing | OverlayState::Sending => {
                    let wave = (self.phase * 1.1 + i as f32 * 0.7).sin() * 0.5 + 0.5;
                    (wave as f32).clamp(0.1, 1.0)
                }
                _ => 0.12,
            };
            let max_h = rect.height() - 4.0;
            let h = 3.0 + t * (max_h - 3.0);
            let x = start_x + i as f32 * (bar_w + bar_gap);
            let y = rect.center().y - h * 0.5;
            let alpha = if matches!(self.state, OverlayState::Hidden) {
                80u8
            } else {
                (140.0 + t * 115.0) as u8
            };
            painter.rect_filled(
                egui::Rect::from_min_size(egui::pos2(x, y), Vec2::new(bar_w, h)),
                CornerRadius::same(2),
                Color32::from_rgba_premultiplied(color.r(), color.g(), color.b(), alpha),
            );
        }
    }
}
