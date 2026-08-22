//! Microphone and Loopback capture via cpal (resampled to 16 kHz mono).
//!
//! The audio callbacks run on a real-time OS thread and must NEVER block.
//! We use crossbeam *bounded* channels: the callback sends individual f32
//! samples lock-free via try_send(); the egui thread drains them via
//! try_recv() each frame. The channel capacity caps memory to ~30 s of audio
//! per stream; samples are dropped if the consumer falls behind.

use anyhow::{bail, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use crossbeam_channel::{bounded, Receiver, Sender};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use crate::util::{resample_linear, SAMPLE_RATE};

/// 30 seconds of 16 kHz mono = 480 000 samples per channel.
const CHANNEL_CAP: usize = SAMPLE_RATE as usize * 30;

pub struct Recorder {
    recording: Arc<AtomicBool>,
    /// Accumulated user (mic) samples drained each frame from the channel.
    user_accum: Vec<f32>,
    /// Accumulated other (loopback) samples.
    other_accum: Vec<f32>,
    user_rx: Receiver<f32>,
    other_rx: Receiver<f32>,
    /// RMS * 1000 as integer for cheap cross-thread reads (mic only).
    rms_milli: Arc<AtomicU32>,
    _user_stream: Stream,
    _other_stream: Option<Stream>,
}

impl Recorder {
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();

        let recording = Arc::new(AtomicBool::new(false));
        let rms_milli = Arc::new(AtomicU32::new(0));

        let (user_tx, user_rx) = bounded::<f32>(CHANNEL_CAP);
        let (other_tx, other_rx) = bounded::<f32>(CHANNEL_CAP);

        // 1. Microphone (User)
        let mic_device = host.default_input_device().context("no default input device")?;
        let mic_conf = mic_device.default_input_config().context("default input config")?;

        let user_stream = Self::build_stream(
            &mic_device,
            &mic_conf,
            recording.clone(),
            user_tx,
            rms_milli.clone(),
            true,
        )?;
        user_stream.play()?;
        println!(
            "[local-stt] mic ready (device {} Hz -> {} Hz)",
            mic_conf.sample_rate().0,
            SAMPLE_RATE
        );

        // 2. Loopback (Other)
        let mut other_stream = None;
        if let Some(spk_device) = host.default_output_device() {
            if let Ok(spk_conf) = spk_device.default_output_config() {
                match Self::build_stream(
                    &spk_device,
                    &spk_conf,
                    recording.clone(),
                    other_tx,
                    rms_milli.clone(),
                    false,
                ) {
                    Ok(stream) => {
                        if stream.play().is_ok() {
                            println!(
                                "[local-stt] loopback ready (device {} Hz -> {} Hz)",
                                spk_conf.sample_rate().0,
                                SAMPLE_RATE
                            );
                            other_stream = Some(stream);
                        }
                    }
                    Err(e) => log::warn!("failed to build loopback stream: {e}"),
                }
            }
        }

        if other_stream.is_none() {
            println!("[local-stt] warning: loopback recording unavailable");
        }

        Ok(Self {
            recording,
            user_accum: Vec::new(),
            other_accum: Vec::new(),
            user_rx,
            other_rx,
            rms_milli,
            _user_stream: user_stream,
            _other_stream: other_stream,
        })
    }

    fn build_stream(
        device: &cpal::Device,
        conf: &cpal::SupportedStreamConfig,
        recording: Arc<AtomicBool>,
        tx: Sender<f32>,
        rms_milli: Arc<AtomicU32>,
        update_rms: bool,
    ) -> Result<Stream> {
        let sample_format = conf.sample_format();
        let channels = conf.channels();
        let device_rate = conf.sample_rate().0;
        let stream_config: StreamConfig = conf.clone().into();

        let err_fn = |e| log::error!("audio stream error: {}", e);

        let stream = match sample_format {
            SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    on_input(data, channels, device_rate, &recording, &tx, &rms_milli, update_rms);
                },
                err_fn,
                None,
            )?,
            SampleFormat::I16 => device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    let f: Vec<f32> = data.iter().map(|s| *s as f32 / 32768.0).collect();
                    on_input(&f, channels, device_rate, &recording, &tx, &rms_milli, update_rms);
                },
                err_fn,
                None,
            )?,
            SampleFormat::U16 => device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    let f: Vec<f32> = data.iter().map(|s| (*s as f32 / 32768.0) - 1.0).collect();
                    on_input(&f, channels, device_rate, &recording, &tx, &rms_milli, update_rms);
                },
                err_fn,
                None,
            )?,
            other => bail!("unsupported sample format: {:?}", other),
        };
        Ok(stream)
    }

    pub fn start(&mut self) {
        // Drain any stale samples from a previous session.
        while self.user_rx.try_recv().is_ok() {}
        while self.other_rx.try_recv().is_ok() {}
        self.user_accum.clear();
        self.other_accum.clear();
        self.rms_milli.store(0, Ordering::Relaxed);
        self.recording.store(true, Ordering::SeqCst);
    }

    /// Drain the channels into the accumulators. Call unconditionally every
    /// egui frame to keep the bounded channel from filling up.
    pub fn drain(&mut self) {
        while let Ok(s) = self.user_rx.try_recv() {
            self.user_accum.push(s);
        }
        while let Ok(s) = self.other_rx.try_recv() {
            self.other_accum.push(s);
        }
    }

    /// Stop recording and return all buffered audio. Non-blocking.
    pub fn stop(&mut self) -> (Vec<f32>, Vec<f32>) {
        self.recording.store(false, Ordering::SeqCst);
        // Drain whatever the callbacks already sent before the flag propagated.
        self.drain();
        let user = std::mem::take(&mut self.user_accum);
        let other = std::mem::take(&mut self.other_accum);
        (user, other)
    }

    pub fn buffered_user(&self) -> usize {
        self.user_accum.len()
    }

    pub fn buffered_other(&self) -> usize {
        self.other_accum.len()
    }

    pub fn take_prefix_user(&mut self, n: usize) -> Option<Vec<f32>> {
        if self.user_accum.len() < n {
            return None;
        }
        Some(self.user_accum.drain(..n).collect())
    }

    pub fn take_prefix_other(&mut self, n: usize) -> Option<Vec<f32>> {
        if self.other_accum.len() < n {
            return None;
        }
        Some(self.other_accum.drain(..n).collect())
    }

    pub fn rms(&self) -> f32 {
        self.rms_milli.load(Ordering::Relaxed) as f32 / 1000.0
    }
}

/// Called from the real-time audio thread — MUST NOT block.
/// Sends resampled mono f32 samples via try_send() (non-blocking).
/// Samples are silently dropped if the channel is full (consumer too slow).
fn on_input(
    data: &[f32],
    channels: u16,
    device_rate: u32,
    recording: &AtomicBool,
    tx: &Sender<f32>,
    rms_milli: &AtomicU32,
    update_rms: bool,
) {
    // Down-mix to mono.
    let mono: Vec<f32> = if channels <= 1 {
        data.to_vec()
    } else {
        data.chunks(channels as usize)
            .map(|c| c.iter().sum::<f32>() / channels as f32)
            .collect()
    };

    // RMS for the visualiser — always update so the pulsing circle is live.
    if update_rms && !mono.is_empty() {
        let mean_sq = mono.iter().map(|s| s * s).sum::<f32>() / mono.len() as f32;
        let rms = mean_sq.sqrt();
        let old = rms_milli.load(Ordering::Relaxed);
        let new_val = (rms * 1000.0) as u32;
        let blended = if old > 0 { (old * 3 + new_val) / 4 } else { new_val };
        rms_milli.store(blended, Ordering::Relaxed);
    }

    if !recording.load(Ordering::SeqCst) {
        return;
    }

    // Resample to 16 kHz and send each sample. try_send never blocks;
    // if the channel is full we drop the sample (bounded back-pressure).
    let resampled = resample_linear(&mono, device_rate, SAMPLE_RATE);
    for s in resampled {
        if tx.try_send(s).is_err() {
            // Channel full — consumer is behind. Drop silently.
            // log::warn is not safe to call from a real-time thread.
            break;
        }
    }
}
