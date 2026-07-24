//! Parakeet TDT v3 INT8 via sherpa-onnx.

use anyhow::{bail, Context, Result};
use parking_lot::Mutex;
use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineTransducerModelConfig,
};
use std::sync::Arc;
use std::time::Instant;

use crate::model::{ensure_parakeet_int8, ModelPaths};
use crate::util::{cpu_threads, trim_silence, SAMPLE_RATE};

#[derive(Debug)]
pub struct Segment {
    pub start_time: f32,
    pub text: String,
}

pub struct AsrEngine {
    recognizer: Mutex<OfflineRecognizer>,
    #[allow(dead_code)]
    paths: ModelPaths,
}

impl AsrEngine {
    pub fn load() -> Result<Arc<Self>> {
        let paths = ensure_parakeet_int8()?;
        let threads = cpu_threads();
        println!(
            "[local-stt] loading Parakeet TDT v3 INT8 (sherpa-onnx, cpu, threads={threads})..."
        );

        let mut config = OfflineRecognizerConfig::default();
        config.model_config.transducer = OfflineTransducerModelConfig {
            encoder: Some(paths.encoder.to_string_lossy().into_owned()),
            decoder: Some(paths.decoder.to_string_lossy().into_owned()),
            joiner: Some(paths.joiner.to_string_lossy().into_owned()),
        };
        config.model_config.tokens = Some(paths.tokens.to_string_lossy().into_owned());
        config.model_config.model_type = Some("nemo_transducer".into());
        config.model_config.provider = Some("cpu".into());
        config.model_config.num_threads = threads;
        config.model_config.debug = false;
        config.decoding_method = Some("greedy_search".into());

        let recognizer = OfflineRecognizer::create(&config)
            .context("SherpaOnnxCreateOfflineRecognizer failed")?;

        // Warmup
        {
            let stream = recognizer.create_stream();
            let dummy = vec![0.0f32; (SAMPLE_RATE as usize) * 8 / 10];
            stream.accept_waveform(SAMPLE_RATE as i32, &dummy);
            recognizer.decode(&stream);
            let _ = stream.get_result();
        }

        println!("[local-stt] Parakeet INT8 ready");
        Ok(Arc::new(Self {
            recognizer: Mutex::new(recognizer),
            paths,
        }))
    }

    pub fn label(&self) -> &'static str {
        "Parakeet TDT v3 - INT8"
    }

    pub fn transcribe_labeled(&self, audio: &[f32], label: Option<&str>) -> Result<Vec<Segment>> {
        let (trimmed, skipped) = trim_silence(audio, SAMPLE_RATE, 32.0, 120);
        let audio_s = trimmed.len() as f64 / SAMPLE_RATE as f64;
        let skipped_s = skipped as f32 / SAMPLE_RATE as f32;
        
        if trimmed.len() < (SAMPLE_RATE as usize) * 3 / 10 {
            return Ok(Vec::new());
        }

        let t0 = Instant::now();
        let recognizer = self.recognizer.lock();
        let stream = recognizer.create_stream();
        stream.accept_waveform(SAMPLE_RATE as i32, &trimmed);
        recognizer.decode(&stream);
        let res = match stream.get_result() {
            Some(r) => r,
            None => bail!("no recognition result"),
        };
        
        let mut segments = Vec::new();
        if let Some(ts) = &res.timestamps {
            let gap_threshold = 1.0;
            let mut splits = Vec::new();
            splits.push(0);
            
            let mut last_t = ts.first().copied().unwrap_or(0.0);
            for (i, &t) in ts.iter().enumerate() {
                if t - last_t >= gap_threshold {
                    splits.push(i);
                }
                last_t = t;
            }
            splits.push(ts.len());
            
            for w in splits.windows(2) {
                let start_idx = w[0];
                let end_idx = w[1];
                if start_idx == end_idx { continue; }
                
                let segment_tokens = &res.tokens[start_idx..end_idx];
                let mut seg_text = String::new();
                for tok in segment_tokens {
                    seg_text.push_str(tok);
                }
                let clean_text = seg_text.replace("\u{2581}", " ").trim().to_string();
                
                if !clean_text.is_empty() {
                    segments.push(Segment {
                        start_time: skipped_s + ts[start_idx],
                        text: clean_text,
                    });
                }
            }
        }
        
        if segments.is_empty() {
            let clean = res.text.trim().to_string();
            if !clean.is_empty() {
                segments.push(Segment {
                    start_time: skipped_s,
                    text: clean,
                });
            }
        }

        let dt = t0.elapsed().as_secs_f64();
        let rtf = if audio_s > 0.0 { dt / audio_s } else { 0.0 };
        let tag = label.unwrap_or("parakeet-int8");
        println!(
            "[local-stt] {tag}: transcribed {} segments in {dt:.2}s (audio {audio_s:.1}s, RTF {rtf:.2}x)",
            segments.len()
        );
        Ok(segments)
    }
}
