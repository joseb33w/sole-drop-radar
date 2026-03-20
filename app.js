(() => {
  try {
    const { createClient } = supabase;
    const { createApp, ref, computed, onMounted } = Vue;

    const SUPABASE_URL = 'https://xhhmxabftbyxrirvvihn.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_NZHoIxqqpSvVBP8MrLHCYA_gmg1AbN-';
    const RELEASES_TABLE = 'uNMexs7BYTXQ2_sole_drop_radar_releases';
    const FAVORITES_TABLE = 'uNMexs7BYTXQ2_sole_drop_radar_favorites';
    const APP_USERS_TABLE = 'uNMexs7BYTXQ2_sole_drop_radar_app_users';
    const EMAIL_REDIRECT = 'https://sling-gogiapp.web.app/email-confirmed.html';
    const FALLBACK_IMAGE = 'https://placehold.co/1200x800/111827/f8fafc?text=Sole+Drop+Radar';

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    createApp({
      setup() {
        const screen = ref('loading');
        const authMode = ref('signup');
        const email = ref('');
        const password = ref('');
        const authError = ref('');
        const authBusy = ref(false);
        const authNotice = ref('');
        const statusMessage = ref('');
        const releases = ref([]);
        const favorites = ref([]);
        const filter = ref('all');
        const loadingReleases = ref(false);
        const loadingFavorites = ref(false);
        const actionBusyId = ref('');
        const user = ref(null);
        const signingOut = ref(false);
        const booting = ref(true);
        const authInitialized = ref(false);
        const authTransitionToken = ref(0);
        const authEventInFlight = ref(false);

        const filteredReleases = computed(() => {
          const now = new Date();
          const base = releases.value.filter((item) => {
            const releaseDate = item.release_date ? new Date(item.release_date) : null;
            if (filter.value === 'upcoming') {
              return releaseDate ? releaseDate >= now : true;
            }
            if (filter.value === 'favorites') {
              return favorites.value.some((fav) => fav.release_id === item.id);
            }
            return true;
          });

          return [...base].sort((a, b) => {
            const aTime = a.release_date ? new Date(a.release_date).getTime() : 0;
            const bTime = b.release_date ? new Date(b.release_date).getTime() : 0;
            return aTime - bTime;
          });
        });

        const nextDrop = computed(() => {
          const now = new Date();
          return [...releases.value]
            .filter((item) => item.release_date && new Date(item.release_date) >= now)
            .sort((a, b) => new Date(a.release_date) - new Date(b.release_date))[0] || null;
        });

        const favoriteIds = computed(() => new Set(favorites.value.map((item) => item.release_id)));
        const favoriteCount = computed(() => favorites.value.length);
        const upcomingCount = computed(() => {
          const now = new Date();
          return releases.value.filter((item) => item.release_date && new Date(item.release_date) >= now).length;
        });
        const loadedCount = computed(() => releases.value.length);
        const signedIn = computed(() => !!user.value);
        const appReady = computed(() => !booting.value && authInitialized.value);
        const authTitle = computed(() => {
          if (screen.value === 'check-email') return 'Check your email';
          return authMode.value === 'signup' ? 'Create your account' : 'Welcome back';
        });
        const authSubtitle = computed(() => {
          if (screen.value === 'check-email') {
            return `We sent a confirmation link to ${email.value || 'your email'}. Click it, then come back and sign in.`;
          }
          return authMode.value === 'signup'
            ? 'Sign up to save favorite drops and track upcoming releases.'
            : 'Sign in to sync your favorites and keep your release radar up to date.';
        });
        const authButtonLabel = computed(() => {
          if (authBusy.value) return authMode.value === 'signup' ? 'Creating account...' : 'Signing in...';
          return authMode.value === 'signup' ? 'Create account' : 'Log in';
        });
        const userLabel = computed(() => user.value?.email || 'Signed in');
        const logoutLabel = computed(() => (signingOut.value ? 'Logging out...' : 'Log out'));
        const authButtonBusy = computed(() => authBusy.value);
        const logoutBusy = computed(() => signingOut.value);

        function resetAuthFeedback() {
          authError.value = '';
          authNotice.value = '';
        }

        function switchAuthMode(mode) {
          authMode.value = mode;
          screen.value = mode === 'signup' ? 'signup' : 'signin';
          resetAuthFeedback();
          authBusy.value = false;
          signingOut.value = false;
          if (mode === 'signin' && email.value.trim()) {
            authNotice.value = 'Sign in with your existing account.';
          }
        }

        function resetSessionView() {
          favorites.value = [];
          filter.value = 'all';
          actionBusyId.value = '';
          loadingFavorites.value = false;
        }

        function clearAuthForm(options = {}) {
          const { keepEmail = true } = options;
          if (!keepEmail) {
            email.value = '';
          }
          password.value = '';
        }

        function applySignedOutState(options = {}) {
          const {
            notice = 'Logged out successfully.',
            keepEmail = true,
            mode = 'signin'
          } = options;

          user.value = null;
          signingOut.value = false;
          authBusy.value = false;
          authEventInFlight.value = false;
          resetSessionView();
          clearAuthForm({ keepEmail });
          authMode.value = mode;
          authError.value = '';
          authNotice.value = notice;
          screen.value = mode === 'signup' ? 'signup' : 'signin';
        }

        function isMissingSessionError(error) {
          if (!error) return false;
          const message = String(error.message || '').toLowerCase();
          const name = String(error.name || '').toLowerCase();
          return (
            name.includes('authsessionmissingerror') ||
            message.includes('auth session missing') ||
            message.includes('session missing') ||
            error.status === 400
          );
        }

        function nextTransitionToken() {
          authTransitionToken.value += 1;
          return authTransitionToken.value;
        }

        function isLatestTransition(token) {
          return token === authTransitionToken.value;
        }

        function formatDate(value) {
          if (!value) return 'TBD';
          return new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }).format(new Date(value));
        }

        function formatPrice(value) {
          if (value === null || value === undefined || value === '') return 'TBD';
          const number = Number(value);
          if (Number.isNaN(number)) return String(value);
          return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
          }).format(number);
        }

        function daysUntil(value) {
          if (!value) return 'Date TBD';
          const today = new Date();
          const release = new Date(value);
          const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const startRelease = new Date(release.getFullYear(), release.getMonth(), release.getDate());
          const diff = Math.round((startRelease - startToday) / 86400000);
          if (diff > 1) return `${diff} days away`;
          if (diff === 1) return 'Tomorrow';
          if (diff === 0) return 'Drops today';
          if (diff === -1) return 'Dropped yesterday';
          return `Dropped ${Math.abs(diff)} days ago`;
        }

        function imageFor(item) {
          return item.image_url || FALLBACK_IMAGE;
        }

        function isFavorite(releaseId) {
          return favoriteIds.value.has(releaseId);
        }

        async function ensureAppUser(currentUser) {
          if (!currentUser?.id || !currentUser?.email) return;
          const { data, error } = await client
            .from(APP_USERS_TABLE)
            .select('id')
            .eq('user_id', currentUser.id)
            .limit(1);

          if (error) throw error;
          if (!data || data.length === 0) {
            const { error: insertError } = await client.from(APP_USERS_TABLE).insert({
              user_id: currentUser.id,
              email: currentUser.email
            });
            if (insertError) throw insertError;
          }
        }

        async function loadReleases() {
          loadingReleases.value = true;
          statusMessage.value = '';
          try {
            const { data, error } = await client
              .from(RELEASES_TABLE)
              .select('*')
              .order('release_date', { ascending: true });
            if (error) throw error;
            releases.value = data || [];
            if (!data || data.length === 0) {
              statusMessage.value = 'No sneaker releases are available yet.';
            }
          } catch (error) {
            console.error('Load releases error:', error.message, error);
            statusMessage.value = 'Could not load releases from the backend right now.';
            releases.value = [];
          } finally {
            loadingReleases.value = false;
          }
        }

        async function loadFavorites() {
          if (!user.value) {
            favorites.value = [];
            return;
          }
          loadingFavorites.value = true;
          try {
            const { data, error } = await client
              .from(FAVORITES_TABLE)
              .select('id, release_id')
              .order('created_at', { ascending: false });
            if (error) throw error;
            favorites.value = data || [];
          } catch (error) {
            console.error('Load favorites error:', error.message, error);
            authNotice.value = 'Could not refresh favorites right now.';
            favorites.value = [];
          } finally {
            loadingFavorites.value = false;
          }
        }

        async function hydrateSignedInUser(currentUser, options = {}) {
          const { notice = 'Signed in successfully.' } = options;
          user.value = currentUser;
          screen.value = 'app';
          authError.value = '';
          authNotice.value = notice;
          await ensureAppUser(currentUser);
          await Promise.all([loadReleases(), loadFavorites()]);
          clearAuthForm({ keepEmail: true });
        }

        async function syncUserFromSession(session, options = {}) {
          const token = nextTransitionToken();
          const currentUser = session?.user || null;
          authEventInFlight.value = true;
          try {
            if (!currentUser) {
              applySignedOutState({
                notice: options.notice || 'Signed out. Log back in anytime.',
                keepEmail: true,
                mode: 'signin'
              });
              await loadReleases();
              return;
            }

            await hydrateSignedInUser(currentUser, {
              notice: options.notice || 'Signed in successfully.'
            });
          } catch (error) {
            console.error('Auth sync error:', error.message, error);
            if (isLatestTransition(token)) {
              applySignedOutState({
                notice: '',
                keepEmail: true,
                mode: 'signin'
              });
              authError.value = error.message || 'We could not complete authentication.';
            }
          } finally {
            if (isLatestTransition(token)) {
              authBusy.value = false;
              signingOut.value = false;
              booting.value = false;
              authInitialized.value = true;
              authEventInFlight.value = false;
            }
          }
        }

        async function initializeApp() {
          booting.value = true;
          authError.value = '';
          authNotice.value = '';
          try {
            const { data, error } = await client.auth.getSession();
            if (error && !isMissingSessionError(error)) {
              throw error;
            }
            await loadReleases();
            await syncUserFromSession(data?.session || null, {
              notice: data?.session?.user ? 'Signed in successfully.' : 'Sign in to save favorites.'
            });
          } catch (error) {
            console.error('App init error:', error.message, error);
            await loadReleases();
            applySignedOutState({
              notice: 'Sign in to save favorites.',
              keepEmail: true,
              mode: 'signin'
            });
            authInitialized.value = true;
            booting.value = false;
          }
        }

        async function submitAuth() {
          if (authBusy.value || signingOut.value) return;
          resetAuthFeedback();

          const nextEmail = email.value.trim();
          const nextPassword = password.value;

          if (!nextEmail || !nextPassword) {
            authError.value = 'Enter both your email and password.';
            return;
          }

          authBusy.value = true;
          const token = nextTransitionToken();

          try {
            if (authMode.value === 'signup') {
              const { error } = await client.auth.signUp({
                email: nextEmail,
                password: nextPassword,
                options: {
                  emailRedirectTo: EMAIL_REDIRECT
                }
              });

              if (error) {
                const normalized = String(error.message || '').toLowerCase();
                if (normalized.includes('already been registered') || normalized.includes('user already registered')) {
                  const signInResult = await client.auth.signInWithPassword({
                    email: nextEmail,
                    password: nextPassword
                  });
                  if (signInResult.error) {
                    throw signInResult.error;
                  }
                  await syncUserFromSession(signInResult.data.session, {
                    notice: 'Signed in successfully.'
                  });
                  return;
                }
                throw error;
              }

              if (!isLatestTransition(token)) return;
              screen.value = 'check-email';
              authBusy.value = false;
              authNotice.value = 'Check your inbox, then come back and sign in.';
              clearAuthForm({ keepEmail: true });
              return;
            }

            const { data, error } = await client.auth.signInWithPassword({
              email: nextEmail,
              password: nextPassword
            });
            if (error) throw error;
            await syncUserFromSession(data.session, {
              notice: 'Signed in successfully.'
            });
          } catch (error) {
            console.error('Auth submit error:', error.message, error);
            authBusy.value = false;
            if (String(error.message || '').toLowerCase().includes('email not confirmed')) {
              authError.value = 'Please check your email and click the confirmation link first.';
              screen.value = 'check-email';
              return;
            }
            if (String(error.message || '').toLowerCase().includes('invalid login credentials')) {
              authError.value = 'Incorrect email or password.';
              return;
            }
            authError.value = error.message || 'Authentication failed. Please try again.';
          }
        }

        async function handleLogout() {
          if (signingOut.value || authBusy.value) return;
          signingOut.value = true;
          authError.value = '';
          authNotice.value = 'Logging out...';
          applySignedOutState({
            notice: 'Logged out successfully.',
            keepEmail: true,
            mode: 'signin'
          });
          signingOut.value = true;

          try {
            const { error } = await client.auth.signOut();
            if (error && !isMissingSessionError(error)) {
              throw error;
            }
            await loadReleases();
            authNotice.value = 'Logged out successfully.';
          } catch (error) {
            console.error('Logout error:', error.message, error);
            authNotice.value = 'Logged out locally. Refresh if your session still appears active.';
          } finally {
            signingOut.value = false;
          }
        }

        async function toggleFavorite(release) {
          if (!user.value) {
            authNotice.value = 'Sign in required for favorites.';
            screen.value = 'signin';
            return;
          }
          if (actionBusyId.value) return;

          actionBusyId.value = release.id;
          try {
            const existing = favorites.value.find((item) => item.release_id === release.id);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
            } else {
              const { error } = await client.from(FAVORITES_TABLE).insert({
                release_id: release.id
              });
              if (error) throw error;
            }
            await loadFavorites();
          } catch (error) {
            console.error('Favorite toggle error:', error.message, error);
            authNotice.value = 'Could not update favorites right now.';
          } finally {
            actionBusyId.value = '';
          }
        }

        onMounted(async () => {
          await initializeApp();
          client.auth.onAuthStateChange(async (event, session) => {
            if (authEventInFlight.value) return;
            if (event === 'SIGNED_OUT') {
              await syncUserFromSession(null, {
                notice: 'Logged out successfully.'
              });
              return;
            }
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
              await syncUserFromSession(session, {
                notice: event === 'SIGNED_IN' ? 'Signed in successfully.' : authNotice.value || ''
              });
            }
          });
        });

        return {
          screen,
          authMode,
          email,
          password,
          authError,
          authBusy,
          authNotice,
          statusMessage,
          releases,
          favorites,
          filter,
          loadingReleases,
          loadingFavorites,
          actionBusyId,
          user,
          signingOut,
          booting,
          authInitialized,
          filteredReleases,
          nextDrop,
          favoriteCount,
          upcomingCount,
          loadedCount,
          signedIn,
          appReady,
          authTitle,
          authSubtitle,
          authButtonLabel,
          userLabel,
          logoutLabel,
          authButtonBusy,
          logoutBusy,
          switchAuthMode,
          formatDate,
          formatPrice,
          daysUntil,
          imageFor,
          isFavorite,
          submitAuth,
          handleLogout,
          toggleFavorite
        };
      },
      template: `
        <div class="app-shell">
          <div class="bg-glow glow-one"></div>
          <div class="bg-glow glow-two"></div>
          <div class="bg-orb"></div>
          <div class="bg-mesh"></div>

          <div v-if="!appReady" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>Loading your experience</h2>
              <p class="muted-copy">Syncing releases, restoring your session, and getting everything ready.</p>
              <button class="primary-btn auth-submit-btn" type="button" disabled>
                <span class="button-inner">
                  <span class="button-spinner" aria-hidden="true"></span>
                  <span>Loading...</span>
                </span>
              </button>
            </section>
          </div>

          <div v-else-if="!signedIn" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>{{ authTitle }}</h2>
              <p class="muted-copy">{{ authSubtitle }}</p>

              <div v-if="authError" class="form-error">{{ authError }}</div>
              <div v-else-if="authNotice" class="form-notice">{{ authNotice }}</div>

              <form v-if="screen !== 'check-email'" class="auth-form" @submit.prevent="submitAuth">
                <label>
                  Email
                  <input v-model.trim="email" type="email" autocomplete="email" placeholder="you@example.com" :disabled="authBusy || signingOut" />
                </label>
                <label>
                  Password
                  <input v-model="password" type="password" autocomplete="current-password" placeholder="Enter your password" :disabled="authBusy || signingOut" />
                </label>
                <button class="primary-btn auth-submit-btn" type="submit" :disabled="authBusy || signingOut">
                  <span class="button-inner">
                    <span v-if="authButtonBusy" class="button-spinner" aria-hidden="true"></span>
                    <span>{{ authButtonLabel }}</span>
                  </span>
                </button>
              </form>

              <div v-else class="auth-form">
                <button class="primary-btn auth-submit-btn" type="button" @click="switchAuthMode('signin')">
                  <span class="button-inner">
                    <span>Go to Sign In</span>
                  </span>
                </button>
              </div>

              <button
                v-if="screen !== 'check-email' && authMode === 'signup'"
                class="text-btn"
                type="button"
                @click="switchAuthMode('signin')"
                :disabled="authBusy || signingOut"
              >
                Already have an account? Sign in
              </button>
              <button
                v-if="screen !== 'check-email' && authMode === 'signin'"
                class="text-btn"
                type="button"
                @click="switchAuthMode('signup')"
                :disabled="authBusy || signingOut"
              >
                Do not have an account? Sign up
              </button>
            </section>
          </div>

          <main v-else class="container">
            <section class="hero-card">
              <div>
                <span class="eyebrow">Sneaker release tracker</span>
                <h1>Stay ahead of every drop.</h1>
                <p class="muted-copy hero-copy">
                  Discover upcoming sneaker launches, save your favorites, and keep your radar locked on the pairs that matter most.
                </p>
              </div>
              <div class="hero-actions">
                <span class="pill">{{ userLabel }}</span>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" @click="filter = 'upcoming'">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" @click="filter = 'favorites'">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" @click="handleLogout" :disabled="logoutBusy || authBusy">
                  <span class="button-inner">
                    <span v-if="logoutBusy" class="button-spinner" aria-hidden="true"></span>
                    <span>{{ logoutLabel }}</span>
                  </span>
                </button>
              </div>
            </section>

            <section v-if="authNotice || statusMessage" class="status-banner">
              {{ authNotice || statusMessage }}
            </section>

            <section class="stats-grid">
              <article class="stat-card">
                <span>Upcoming releases</span>
                <strong>{{ upcomingCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Favorites saved</span>
                <strong>{{ favoriteCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Total loaded</span>
                <strong>{{ loadedCount }}</strong>
              </article>
            </section>

            <section class="release-grid">
              <article v-if="nextDrop" class="release-card">
                <img class="release-image" :src="imageFor(nextDrop)" :alt="nextDrop.name" />
                <div class="release-content">
                  <span class="release-brand">Next drop</span>
                  <div class="release-top">
                    <div>
                      <h2>{{ nextDrop.name }}</h2>
                      <p class="muted-copy">{{ nextDrop.brand || 'Sneaker release' }}</p>
                    </div>
                    <span class="countdown-pill">{{ daysUntil(nextDrop.release_date) }}</span>
                  </div>
                  <div class="detail-grid">
                    <div>
                      <span class="detail-label">Release date</span>
                      <strong>{{ formatDate(nextDrop.release_date) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Retail</span>
                      <strong>{{ formatPrice(nextDrop.price) }}</strong>
                    </div>
                  </div>
                  <div class="card-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(nextDrop.id) }"
                      @click="toggleFavorite(nextDrop)"
                      :disabled="actionBusyId === nextDrop.id || loadingFavorites"
                    >
                      <span class="button-inner">
                        <span v-if="actionBusyId === nextDrop.id" class="button-spinner" aria-hidden="true"></span>
                        <span>{{ isFavorite(nextDrop.id) ? 'Saved to favorites' : 'Save to favorites' }}</span>
                      </span>
                    </button>
                    <span class="status-chip">featured</span>
                  </div>
                </div>
              </article>

              <article
                v-for="release in filteredReleases"
                :key="release.id"
                class="release-card"
              >
                <img class="release-image" :src="imageFor(release)" :alt="release.name" />
                <div class="release-content">
                  <span class="release-brand">{{ release.brand || 'Sneaker release' }}</span>
                  <div class="release-top">
                    <div>
                      <h2>{{ release.name }}</h2>
                      <p class="muted-copy">{{ release.colorway || 'Colorway to be announced' }}</p>
                    </div>
                    <span class="countdown-pill">{{ daysUntil(release.release_date) }}</span>
                  </div>
                  <div class="detail-grid">
                    <div>
                      <span class="detail-label">Release date</span>
                      <strong>{{ formatDate(release.release_date) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Retail</span>
                      <strong>{{ formatPrice(release.price) }}</strong>
                    </div>
                  </div>
                  <div class="card-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(release.id) }"
                      @click="toggleFavorite(release)"
                      :disabled="actionBusyId === release.id || loadingFavorites"
                    >
                      <span class="button-inner">
                        <span v-if="actionBusyId === release.id" class="button-spinner" aria-hidden="true"></span>
                        <span>{{ isFavorite(release.id) ? 'Saved to favorites' : 'Save to favorites' }}</span>
                      </span>
                    </button>
                    <span class="status-chip">{{ release.status || 'scheduled' }}</span>
                  </div>
                </div>
              </article>

              <section v-if="!loadingReleases && filteredReleases.length === 0" class="empty-state">
                <span class="eyebrow">No releases found</span>
                <h2>Nothing matches this filter right now.</h2>
                <p class="muted-copy">Try switching filters or check back later for new drops.</p>
              </section>
            </section>
          </main>
        </div>
      `
    }).mount('#app');
  } catch (error) {
    console.error('App bootstrap error:', error.message, error);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;background:#090b12;color:#f8fafc;padding:24px;font-family:Inter,system-ui,sans-serif;">
          <div style="max-width:520px;background:rgba(12,18,36,0.86);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.28);">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8bdcfb;margin-bottom:8px;">Sole Drop Radar</div>
            <h1 style="margin:0 0 12px;font-size:32px;line-height:1.05;">Something went wrong.</h1>
            <p style="margin:0;color:rgba(232,238,255,0.72);">The app hit an unexpected error while starting. Refresh the page and try again.</p>
          </div>
        </div>
      `;
    }
  }
})();
