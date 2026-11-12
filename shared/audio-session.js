// iOS Safari の Web Audio は既定で着信音と同じ扱いになり、消音モードでは鳴らない。動画と同じ「再生」扱いにして消音モードでも鳴らす
if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
