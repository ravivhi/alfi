// Android WebView has no Web Speech API. This stands in for window.speechSynthesis and routes the game's
// say() calls to the phone's Android text-to-speech (Java bridge "AlfiTTS"). Injected before the page's scripts run.
(function () {
  if (!window.AlfiTTS) return;
  function Utterance(text) {
    this.text = text || '';
    this.lang = 'he-IL';
    this.rate = 1;
    this.pitch = 1;
    this.voice = null;
    this.volume = 1;
  }
  // localService is true because hasHebrew() is true only for an installed, on-device Hebrew voice (MainActivity
  // picks it from the engine's voices and never a network one); with none, the list is empty.
  var hebrew = [{ name:'Android Hebrew (natural)', lang: 'he-IL', localService: true, default: true, voiceURI: 'android-he' }];
  var seq = 0, pending = {};
  var synth = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: function () { return window.AlfiTTS.hasHebrew() ? hebrew : []; },
    speak: function (u) {
      var text = String(u.text || ''), rate = +u.rate || 1, pitch = +u.pitch || 1;
      if (typeof window.AlfiTTS.speak2 === 'function') {
        var id = 'u' + (++seq);
        pending[id] = u;
        var vol = (u.volume === undefined || u.volume === null || isNaN(+u.volume)) ? 1 : +u.volume;
        window.AlfiTTS.speak2(text, rate, pitch, vol, id);
      } else {
        window.AlfiTTS.speak(text, rate, pitch);
      }
    },
    cancel: function () { pending = {}; window.AlfiTTS.stop(); },
    pause: function () {}, resume: function () {},
    addEventListener: function () {}, removeEventListener: function () {}
  };
  try { Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true }); }
  catch (e) { window.speechSynthesis = synth; }
  window.SpeechSynthesisUtterance = Utterance;
  // Called from Java when an utterance finished (or failed), so the page gets its onend.
  window.__alfiTtsDone = function (id) {
    var u = pending[id];
    delete pending[id];
    if (u && typeof u.onend === 'function') { try { u.onend({ type: 'end' }); } catch (e) {} }
  };
  // Called by the app once the Android engine is ready, so the game re-reads the voice list.
  window.__alfiVoicesReady = function () {
    if (typeof synth.onvoiceschanged === 'function') synth.onvoiceschanged();
  };
})();
