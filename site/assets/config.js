/* WebSocket URL for the game server.
   Leave serverUrl empty until you host one. The site then stays in offline mode.
   After Render (or Fly) gives you a hostname, set this to the secure WebSocket URL
   and push to main so GitHub Pages republishes it. Example:
   window.PR_CONFIG = { serverUrl: "wss://pandemicradar.onrender.com" };
   You can also override one session with ?server=ws://127.0.0.1:8080
*/
window.PR_CONFIG = {
  serverUrl: ""
};
