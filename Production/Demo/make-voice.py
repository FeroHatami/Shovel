# Generates the voiceover clips and build/timing.json from narration.json.
# Voice: Kokoro (open-source neural voice, runs locally; model files in .tts/). Run with the tool's Python:
#   .tts/venv/bin/python make-voice.py
# Without the model it falls back to the macOS voice "Ava (Premium)", which sounds more synthetic.
import json, os, subprocess
os.makedirs('build', exist_ok=True)
VOICE, SPEED = os.environ.get('VOICE', 'am_michael'), float(os.environ.get('SPEED', '1.0'))
n = json.load(open('narration.json'))
kokoro = None
if os.path.exists('.tts/kokoro-v1.0.onnx'):
    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf
        kokoro = Kokoro('.tts/kokoro-v1.0.onnx', '.tts/voices-v1.0.bin')
    except ImportError:
        print('kokoro not importable – run with .tts/venv/bin/python; falling back to macOS say')
# spellings the neural voice reads naturally
def spoken(t):
    return t.replace('D.N.', 'D N').replace('A.I.', 'AI').replace('G.A.E.B.', 'GAEB')
total = 0
for s in n:
    raw = f"build/{s['id']}.raw.wav"
    if kokoro:
        samples, sr = kokoro.create(spoken(s['say']), voice=VOICE, speed=SPEED, lang='en-us')
        sf.write(raw, samples, sr)
    else:
        raw = f"build/{s['id']}.aiff"
        subprocess.run(['say', '-v', 'Ava (Premium)', '-r', '196', '-o', raw, s['say']], check=True)
    # trim silence at both ends, 48 kHz stereo
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', '-ar', '48000', '-ac', '2', f"build/{s['id']}.wav"], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f"build/{s['id']}.wav"], capture_output=True, text=True).stdout)
    s['dur'] = round(d, 2); total += d
    print(f"{s['id']:9s} {d:5.2f} s")
print(f"voice: {'Kokoro ' + VOICE if kokoro else 'macOS Ava'} · speech total {total:.1f} s")
json.dump(n, open('build/timing.json', 'w'), indent=1, ensure_ascii=False)
