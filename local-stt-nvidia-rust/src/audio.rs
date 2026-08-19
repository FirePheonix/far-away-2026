//! Microphone and Loopback capture via cpal (resampled to 16 kHz mono).

use anyhow::{bail, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use crate::util::{resample_linear, SAMPLE_RATE};

pub struct Recorder {
    recording: Arc<AtomicBool>,
    user_buffer: Arc<Mutex<Vec<f32>>>,
    other_buffer: Arc<Mutex<Vec<f32>>>,
    /// RMS * 1000 as integer for cheap cross-thread reads (combined)
    rms_milli: Arc<AtomicU32>,
    _user_stream: Stream,
    _other_stream: Option<Stream>,
}

impl Recorder {
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();
        
        let recording = Arc::new(AtomicBool::new(false));
        let user_buffer = Arc::new(Mutex::new(Vec::new()));
        let other_buffer = Arc::new(Mutex::new(Vec::new()));
        let rms_milli = Arc::new(AtomicU32::new(0));

        // 1. Setup Microphone (User)
        let mic_device = host.default_input_device().context("no default input device")?;
        let mic_conf = mic_device.default_input_config().context("default input config")?;
        
        let user_stream = Self::build_stream(
            &mic_device,
            &mic_conf,
            recording.clone(),
            user_buffer.clone(),
            rms_milli.clone(),
            true,
        )?;
        user_stream.play()?;
        println!("[local-stt] mic ready (device {} Hz -> {} Hz)", mic_conf.sample_rate().0, SAMPLE_RATE);

        // 2. Setup Loopback (Other)
        let mut other_stream = None;
        if let Some(spk_device) = host.default_output_device() {
            if let Ok(spk_conf) = spk_device.default_output_config() {
                match Self::build_stream(
                    &spk_device,
                    &spk_conf,
                    recording.clone(),
                    other_buffer.clone(),
                    rms_milli.clone(),
                    false, // Don't let loopback dominate the visualizer RMS, although it could be mixed
                ) {
                    Ok(stream) => {
                        if stream.play().is_ok() {
                            println!("[local-stt] loopback ready (device {} Hz -> {} Hz)", spk_conf.sample_rate().0, SAMPLE_RATE);
                            other_stream = Some(stream);
                        }
                    }
                    Err(e) => {
                        log::warn!("failed to build loopback stream: {e}");
                    }
                }
            }
        }

        if other_stream.is_none() {
            println!("[local-stt] warning: loopback recording unavailable");
        }

        Ok(Self {
            recording,
            user_buffer,
            other_buffer,
            rms_milli,
            _user_stream: user_stream,
            _other_stream: other_stream,
        })
    }

    fn build_stream(
        device: &cpal::Device,
        conf: &cpal::SupportedStreamConfig,
        recording: Arc<AtomicBool>,
        buffer: Arc<Mutex<Vec<f32>>>,
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
                    on_input(data, channels, device_rate, &recording, &buffer, &rms_milli, update_rms);
                },
                err_fn,
                None,
            )?,
            SampleFormat::I16 => device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    let f: Vec<f32> = data.iter().map(|s| *s as f32 / 32768.0).collect();
                    on_input(&f, channels, device_rate, &recording, &buffer, &rms_milli, update_rms);
                },
                err_fn,
                None,
            )?,
            SampleFormat::U16 => device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    let f: Vec<f32> = data
                        .iter()
                        .map(|s| (*s as f32 / 32768.0) - 1.0)
                        .collect();
                    on_input(&f, channels, device_rate, &recording, &buffer, &rms_milli, update_rms);
                },
                err_fn,
                None,
            )?,
            other => bail!("unsupported sample format: {:?}", other),
        };
        Ok(stream)
    }

    pub fn start(&self) {
        self.user_buffer.lock().clear();
        self.other_buffer.lock().clear();
        self.rms_milli.store(0, Ordering::Relaxed);
        self.recording.store(true, Ordering::SeqCst);
    }

    pub fn stop(&self) -> (Vec<f32>, Vec<f32>) {
        self.recording.store(false, Ordering::SeqCst);
        std::thread::sleep(std::time::Duration::from_millis(30));
        let user = std::mem::take(&mut *self.user_buffer.lock());
        let other = std::mem::take(&mut *self.other_buffer.lock());
        (user, other)
    }

    pub fn buffered_user(&self) -> usize {
        self.user_buffer.lock().len()
    }

    pub fn buffered_other(&self) -> usize {
        self.other_buffer.lock().len()
    }

    pub fn take_prefix_user(&self, n: usize) -> Option<Vec<f32>> {
        let mut buf = self.user_buffer.lock();
        if buf.len() < n {
            return None;
        }
        Some(buf.drain(..n).collect())
    }

    pub fn take_prefix_other(&self, n: usize) -> Option<Vec<f32>> {
        let mut buf = self.other_buffer.lock();
        if buf.len() < n {
            return None;
        }
        Some(buf.drain(..n).collect())
    }

    pub fn rms(&self) -> f32 {
        self.rms_milli.load(Ordering::Relaxed) as f32 / 1000.0
    }
}

fn on_input(
    data: &[f32],
    channels: u16,
    device_rate: u32,
    recording: &AtomicBool,
    buffer: &Mutex<Vec<f32>>,
    rms_milli: &AtomicU32,
    update_rms: bool,
) {
    let mono_preview: Vec<f32> = if channels <= 1 {
        data.to_vec()
    } else {
        data.chunks(channels as usize)
            .map(|c| c.iter().sum::<f32>() / channels as f32)
            .collect()
    };
    
    if update_rms && !mono_preview.is_empty() {
        let mean_sq = mono_preview.iter().map(|s| s * s).sum::<f32>() / mono_preview.len() as f32;
        let rms = mean_sq.sqrt();
        // cheap moving average for RMS smoothing
        let old = rms_milli.load(Ordering::Relaxed);
        let new_val = (rms * 1000.0) as u32;
        let blended = if old > 0 { (old * 3 + new_val) / 4 } else { new_val };
        rms_milli.store(blended, Ordering::Relaxed);
    }

    if !recording.load(Ordering::SeqCst) {
        return;
    }

    let resampled = resample_linear(&mono_preview, device_rate, SAMPLE_RATE);
    buffer.lock().extend_from_slice(&resampled);
}
