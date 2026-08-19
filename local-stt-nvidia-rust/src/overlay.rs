//! Floating overlay UI state rendered inside the egui window.

use egui::{self, Color32, CornerRadius, Frame, RichText, Sense, Stroke, Vec2};

pub const CARD_W: f32 = 640.0;
pub const CARD_H: f32 = 78.0;
pub const CARD_H_RESULT: f32 = 260.0;

const BG: Color32 = Color32::from_rgb(0x0E, 0x0F, 0x0F);
const BORDER: Color32 = Color32::from_rgb(0x2A, 0x2A, 0x2A);
const TEXT: Color32 = Color32::from_rgb(0xE8, 0xDC, 0xC8);
const SUBTEXT: Color32 = Color32::from_rgb(0x8A, 0x8A, 0x8A);
const ACCENT: Color32 = Color32::from_rgb(0x1B, 0xB9, 0xCE);
const RED: Color32 = Color32::from_rgb(0xB8, 0x78, 0x78);
const GREEN: Color32 = Color32::from_rgb(0x7D, 0xA8, 0x88);

#[derive(Debug, Clone, PartialEq)]
pub enum OverlayState {
    Hidden,
    Listening,
    Processing,
    Result { text: String, ok: bool },
}

pub struct Overlay {
    pub state: OverlayState,
    pub rms: f32,
    pub alpha: f32,
    dismiss_at: Option<f64>,
    phase: f32,
}

impl Default for Overlay {
    fn default() -> Self {
        Self {
            state: OverlayState::Hidden,
            rms: 0.0,
            alpha: 0.0,
            dismiss_at: None,
            phase: 0.0,
        }
    }
}

impl Overlay {
    pub fn show_listening(&mut self) {
        self.state = OverlayState::Listening;
        self.dismiss_at = None;
    }

    pub fn show_processing(&mut self) {
        self.state = OverlayState::Processing;
        self.dismiss_at = None;
    }

    pub fn show_result(&mut self, text: String, ok: bool, now: f64) {
        self.state = OverlayState::Result { text, ok };
        self.dismiss_at = Some(now + 6.0);
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
        let target = if matches!(self.state, OverlayState::Hidden) {
            0.0
        } else {
            0.95
        };
        let step = 0.12;
        if self.alpha < target {
            self.alpha = (self.alpha + step).min(target);
        } else if self.alpha > target {
            self.alpha = (self.alpha - step).max(target);
        }
        self.phase += dt * 8.0;
        if let Some(t) = self.dismiss_at {
            if now >= t {
                self.dismiss();
            }
        }
    }

    pub fn ui(&mut self, ctx: &egui::Context, ui: &mut egui::Ui) {
        let (status, accent, show_result) = match &self.state {
            OverlayState::Hidden => ("", SUBTEXT, None),
            OverlayState::Listening => ("Listening  ·  press again to stop", RED, None),
            OverlayState::Processing => ("Transcribing…", ACCENT, None),
            OverlayState::Result { text, ok } => {
                let label = if *ok { "Done" } else { "Nothing heard" };
                let color = if *ok { GREEN } else { RED };
                (label, color, Some((text.clone(), *ok)))
            }
        };

        let frame = Frame::NONE
            .fill(BORDER)
            .corner_radius(CornerRadius::same(18))
            .inner_margin(1.0);
        frame.show(ui, |ui| {
            Frame::NONE
                .fill(BG)
                .corner_radius(CornerRadius::same(16))
                .inner_margin(egui::Margin::symmetric(20, 14))
                .show(ui, |ui| {
                    ui.set_min_width(CARD_W - 8.0);
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("✦").size(22.0).color(accent));
                        ui.add_space(10.0);
                        ui.label(RichText::new(status).size(15.0).color(TEXT));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            self.draw_bars(ui, accent);
                        });
                    });

                    if let Some((text, _ok)) = show_result {
                        ui.add_space(8.0);
                        ui.separator();
                        ui.add_space(6.0);
                        let heard = if text.len() > 90 {
                            format!("Heard: \"{}…\"", &text[..89])
                        } else if text.is_empty() {
                            String::new()
                        } else {
                            format!("Heard: \"{text}\"")
                        };
                        if !heard.is_empty() {
                            ui.label(RichText::new(heard).size(12.0).color(SUBTEXT));
                        }
                        egui::Frame::NONE
                            .fill(Color32::from_rgb(0x16, 0x17, 0x17))
                            .stroke(Stroke::new(1.0_f32, BORDER))
                            .corner_radius(CornerRadius::same(10))
                            .inner_margin(10.0)
                            .show(ui, |ui| {
                                ui.set_min_height(110.0);
                                ui.set_min_width(CARD_W - 60.0);
                                ui.label(RichText::new(&text).size(14.0).color(TEXT));
                            });
                        ui.add_space(4.0);
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            ui.label(
                                RichText::new("copied to clipboard  ·  Esc to close")
                                    .size(11.0)
                                    .color(SUBTEXT),
                            );
                        });
                    }
                });
        });

        // Escape to dismiss
        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            self.dismiss();
        }
    }

    fn draw_bars(&mut self, ui: &mut egui::Ui, color: Color32) {
        let (rect, _resp) = ui.allocate_exact_size(Vec2::new(44.0, 36.0), Sense::hover());
        let painter = ui.painter_at(rect);
        let rms = (self.rms * 6.0).clamp(0.0, 1.0);
        for i in 0..5 {
            let t = match self.state {
                OverlayState::Listening => {
                    let jitter = ((self.phase + i as f32) * 3.1).sin() * 0.04;
                    (rms + (i as f32 - 2.0) * 0.08 + jitter).clamp(0.0, 1.0)
                }
                OverlayState::Processing => {
                    ((self.phase + i as f32 * 0.8).sin() * 0.5 + 0.5).clamp(0.0, 1.0)
                }
                _ => 0.15,
            };
            let h = 6.0 + t * 26.0;
            let x = rect.left() + 2.0 + i as f32 * 8.0;
            let y = rect.center().y - h * 0.5;
            painter.rect_filled(
                egui::Rect::from_min_size(egui::pos2(x, y), Vec2::new(5.0, h)),
                CornerRadius::same(2),
                color,
            );
        }
    }
}
