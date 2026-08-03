/* Life OS — deployment configuration.
 *
 * Values that belong to a deployment rather than to the product. Safe to be
 * public: a browser OAuth client ID is public by design — Google enforces
 * access by authorised JavaScript origin, not by keeping the ID secret. There
 * is no client secret here and there must never be one; a secret in a page is
 * a secret you have published.
 */
window.LOSConfig = {
  /* Supabase — the shared studio backend. Empty = the app stays exactly as it
   * was: single-user, localStorage only, nothing leaving the phone.
   *
   * The publishable key is public BY DESIGN — it is compiled into every browser
   * that loads this page, so treating it as a secret would be a fiction. What
   * keeps one person's 家庭 list out of another's app is Row Level Security in
   * the database (docs/supabase/001_init.sql), not this string being hidden.
   * Which means one rule has no exceptions: **no table exists without RLS.**
   *
   * The `sb_secret_...` key must never appear in this file. It bypasses every
   * policy above. See docs/SUPABASE_SETUP.md §7. */
  supabaseUrl: 'https://gsedpmwkmavyzjplmzzd.supabase.co',
  supabaseKey: 'sb_publishable_kQcQmyxLmMr_j-Dhvan0cQ_rSTtVIlR',

  /* Google OAuth client ID (type: Web application).
   * Empty = the calendar feature stays completely dormant: nothing renders, no
   * script loads, no request is made. The app is fully usable without it.
   *
   * To fill this in, see docs/GOOGLE_SETUP.md. The authorised JavaScript origin
   * must be exactly:  https://vivian66323-afk.github.io
   */
  googleClientId: '526386036457-i5qtpiba986jf1r44cpmsgara0k4g93n.apps.googleusercontent.com',

  /* Which calendars to read. Empty = the account's primary calendar only.
   * IDs come from Google Calendar → settings for that calendar → "Calendar ID".
   * A calendar can be tied to one of the hats from model.js, so an event knows
   * which part of your life it belongs to. */
  calendars: [
    { id: 'primary', role: '' },
    { id: 'family02854305361841343271@group.calendar.google.com', role: 'home' },
    // joyplan.tw is a separate account shared into this calendar list; mapped to
    // the 工作 hat. Change or remove the line if that is wrong.
    { id: 'joyplan.tw@gmail.com', role: 'work' }
    // Taiwan public holidays are deliberately left out — they are not
    // appointments, and this band is meant to stay short enough to read.
  ]
};
