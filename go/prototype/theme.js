(function(){
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('losTheme'); } catch(e){}
  if(saved){ root.setAttribute('data-theme', saved); }
  function current(){
    var attr = root.getAttribute('data-theme');
    if(attr) return attr;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function apply(){
    var btn = document.getElementById('theme');
    if(btn) btn.textContent = current() === 'dark' ? '☀' : '☾';
  }
  apply();
  document.addEventListener('click', function(e){
    if(e.target.closest && e.target.closest('#theme')){
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('losTheme', next); } catch(e){}
      apply();
    }
  });
})();
