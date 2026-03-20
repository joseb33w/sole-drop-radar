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
            ? 'Step into a more vivid sneaker radar. Save favorite drops, follow launch energy, and keep every release in one cinematic space.'
            : 'Sign in to pick up your saved drops, synced favorites, and the release board exactly where you left it.';
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
              .select('*')
              .eq('user_id', user.value.id)
              .order('created_at', { ascending: false });
            if (error) throw error;
            favorites.value = data || [];
          } catch (error) {
            console.error('Load favorites error:', error.message, error);
            favorites.value = [];
          } finally {
            loadingFavorites.value = false;
          }
        }

        async function syncSignedInState(currentUser, options = {}) {
          const { notice = '' } = options;
          user.value = currentUser;
          screen.value = 'app';
          authInitialized.value = true;
          booting.value = false;
          authBusy.value = false;
          signingOut.value = false;
          authError.value = '';
          authNotice.value = notice;
          clearAuthForm({ keepEmail: true });

          try {
            await ensureAppUser(currentUser);
          } catch (error) {
            console.error('Ensure app user error:', error.message, error);
          }

          await Promise.all([loadReleases(), loadFavorites()]);
        }

        async function restoreSession() {
          booting.value = true;
          try {
            const { data, error } = await client.auth.getSession();
            if (error && !isMissingSessionError(error)) throw error;
            const currentUser = data?.session?.user || null;
            if (currentUser) {
              await syncSignedInState(currentUser);
            } else {
              authInitialized.value = true;
              booting.value = false;
              applySignedOutState({ notice: 'Sign in to save favorites.', keepEmail: true, mode: 'signin' });
              await loadReleases();
            }
          } catch (error) {
            console.error('Restore session error:', error.message, error);
            authInitialized.value = true;
            booting.value = false;
            applySignedOutState({ notice: 'Sign in to save favorites.', keepEmail: true, mode: 'signin' });
            await loadReleases();
          }
        }

        async function handleAuthSubmit() {
          if (authBusy.value || signingOut.value) return;
          resetAuthFeedback();

          const safeEmail = email.value.trim();
          const safePassword = password.value;

          if (!safeEmail || !safePassword) {
            authError.value = 'Enter both your email and password.';
            return;
          }

          authBusy.value = true;

          try {
            if (authMode.value === 'signup') {
              const { error } = await client.auth.signUp({
                email: safeEmail,
                password: safePassword,
                options: {
                  emailRedirectTo: EMAIL_REDIRECT
                }
              });

              if (error) {
                const message = String(error.message || '').toLowerCase();
                const alreadyRegistered = message.includes('already been registered') || message.includes('user already registered');
                if (!alreadyRegistered) throw error;

                const signInResult = await client.auth.signInWithPassword({ email: safeEmail, password: safePassword });
                if (signInResult.error) throw signInResult.error;
                await syncSignedInState(signInResult.data.user, { notice: 'Signed in successfully.' });
                return;
              }

              authBusy.value = false;
              authError.value = '';
              authNotice.value = `Check ${safeEmail} for your confirmation link, then sign in.`;
              screen.value = 'check-email';
              password.value = '';
              return;
            }

            const { data, error } = await client.auth.signInWithPassword({
              email: safeEmail,
              password: safePassword
            });
            if (error) throw error;
            await syncSignedInState(data.user, { notice: 'Signed in successfully.' });
          } catch (error) {
            const message = String(error?.message || 'Unable to continue.');
            if (message.toLowerCase().includes('email not confirmed')) {
              authError.value = 'Please check your email and click the confirmation link first.';
            } else if (message.toLowerCase().includes('invalid login credentials')) {
              authError.value = 'Incorrect email or password.';
            } else {
              authError.value = message;
            }
          } finally {
            authBusy.value = false;
          }
        }

        async function handleLogout() {
          if (signingOut.value || authBusy.value) return;
          signingOut.value = true;
          authError.value = '';
          authNotice.value = 'Logging out...';
          applySignedOutState({ notice: 'Logged out successfully.', keepEmail: true, mode: 'signin' });

          try {
            const { error } = await client.auth.signOut();
            if (error && !isMissingSessionError(error)) {
              console.error('Logout error:', error.message, error);
            }
          } catch (error) {
            console.error('Logout exception:', error.message, error);
          } finally {
            signingOut.value = false;
          }
        }

        async function toggleFavorite(releaseId) {
          if (!user.value || actionBusyId.value) return;
          actionBusyId.value = releaseId;

          try {
            const existing = favorites.value.find((item) => item.release_id === releaseId);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
              favorites.value = favorites.value.filter((item) => item.id !== existing.id);
            } else {
              const { data, error } = await client
                .from(FAVORITES_TABLE)
                .insert({ release_id: releaseId, user_id: user.value.id })
                .select('*')
                .single();
              if (error) throw error;
              favorites.value = [data, ...favorites.value];
            }
          } catch (error) {
            console.error('Toggle favorite error:', error.message, error);
            authNotice.value = 'Could not update favorites right now.';
          } finally {
            actionBusyId.value = '';
          }
        }

        function setFilter(nextFilter) {
          filter.value = nextFilter;
        }

        client.auth.onAuthStateChange(async (event, session) => {
          try {
            const currentUser = session?.user || null;
            if (event === 'SIGNED_OUT' || !currentUser) {
              applySignedOutState({ notice: 'Logged out successfully.', keepEmail: true, mode: 'signin' });
              authInitialized.value = true;
              booting.value = false;
              await loadReleases();
              return;
            }

            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
              await syncSignedInState(currentUser);
            }
          } catch (error) {
            console.error('Auth state change error:', error.message, error);
          }
        });

        onMounted(() => {
          restoreSession();
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
          signedIn,
          appReady,
          authTitle,
          authSubtitle,
          authButtonLabel,
          userLabel,
          logoutLabel,
          authButtonBusy,
          logoutBusy,
          filteredReleases,
          nextDrop,
          favoriteCount,
          upcomingCount,
          loadedCount,
          switchAuthMode,
          handleAuthSubmit,
          handleLogout,
          toggleFavorite,
          setFilter,
          formatDate,
          formatPrice,
          daysUntil,
          imageFor,
          isFavorite
        };
      },
      template: `
        <div class="app-shell">
          <div class="bg-glow glow-one"></div>
          <div class="bg-glow glow-two"></div>
          <div class="bg-orb"></div>
          <div class="bg-mesh"></div>

          <div v-if="screen === 'loading' || booting" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h1>Loading your release board</h1>
              <p class="muted-copy">Pulling in your account state and the latest release lineup.</p>
              <div class="form-notice">
                <span class="button-inner"><span class="button-spinner"></span><span>Loading...</span></span>
              </div>
            </section>
          </div>

          <div v-else-if="!signedIn" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h1>{{ authTitle }}</h1>
              <p class="muted-copy">{{ authSubtitle }}</p>

              <div v-if="authError" class="form-error">{{ authError }}</div>
              <div v-if="authNotice" class="form-notice">{{ authNotice }}</div>

              <template v-if="screen === 'check-email'">
                <button class="secondary-btn" type="button" @click="switchAuthMode('signin')">Go to Sign In</button>
              </template>

              <form v-else class="auth-form" @submit.prevent="handleAuthSubmit">
                <label>
                  <span>Email</span>
                  <input v-model.trim="email" type="email" autocomplete="email" placeholder="you@example.com" />
                </label>
                <label>
                  <span>Password</span>
                  <input v-model="password" type="password" autocomplete="current-password" placeholder="Enter your password" />
                </label>

                <button class="primary-btn auth-submit-btn" type="submit" :disabled="authButtonBusy || logoutBusy">
                  <span class="button-inner">
                    <span v-if="authButtonBusy" class="button-spinner"></span>
                    <span>{{ authButtonLabel }}</span>
                  </span>
                </button>
              </form>

              <button
                v-if="screen !== 'check-email'"
                class="text-btn"
                type="button"
                @click="switchAuthMode(authMode === 'signup' ? 'signin' : 'signup')"
              >
                {{ authMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up" }}
              </button>
            </section>
          </div>

          <main v-else class="container">
            <section class="hero-card">
              <div>
                <span class="eyebrow">Sole Drop Radar</span>
                <h1>Follow every drop with more style.</h1>
                <p class="muted-copy hero-copy">
                  A more artistic sneaker release board with live favorites, launch countdowns, and a cleaner sign-in flow.
                </p>
              </div>

              <div class="hero-actions">
                <div class="pill">{{ userLabel }}</div>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" type="button" @click="setFilter('all')">All</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" type="button" @click="setFilter('upcoming')">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" type="button" @click="setFilter('favorites')">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" type="button" :disabled="logoutBusy || authButtonBusy" @click="handleLogout">
                  <span class="button-inner">
                    <span v-if="logoutBusy" class="button-spinner"></span>
                    <span>{{ logoutLabel }}</span>
                  </span>
                </button>
              </div>
            </section>

            <section v-if="authNotice || statusMessage" class="status-banner">
              <span>{{ authNotice || statusMessage }}</span>
            </section>

            <section class="stats-grid">
              <article class="stat-card">
                <span class="detail-label">Loaded releases</span>
                <strong>{{ loadedCount }}</strong>
              </article>
              <article class="stat-card">
                <span class="detail-label">Upcoming drops</span>
                <strong>{{ upcomingCount }}</strong>
              </article>
              <article class="stat-card">
                <span class="detail-label">Favorites</span>
                <strong>{{ favoriteCount }}</strong>
              </article>
              <article class="stat-card">
                <span class="detail-label">Next drop</span>
                <strong>{{ nextDrop ? daysUntil(nextDrop.release_date) : 'Stay tuned' }}</strong>
              </article>
            </section>

            <section v-if="loadingReleases" class="empty-state">
              <span class="button-inner"><span class="button-spinner"></span><span>Loading releases...</span></span>
            </section>

            <section v-else-if="!filteredReleases.length" class="empty-state">
              <span class="eyebrow">Nothing here yet</span>
              <h2>No releases match this view.</h2>
              <p class="muted-copy">Try another filter or check back after more drops are added.</p>
            </section>

            <section v-else class="releases-grid">
              <article v-for="item in filteredReleases" :key="item.id" class="release-card">
                <img class="release-image" :src="imageFor(item)" :alt="item.name || 'Sneaker release image'" />
                <div class="release-content">
                  <span class="release-brand">{{ item.brand || 'Sneaker release' }}</span>
                  <h2>{{ item.name || 'Untitled release' }}</h2>
                  <p class="muted-copy">{{ item.description || 'No description available yet.' }}</p>

                  <div class="release-meta">
                    <div>
                      <span class="detail-label">Release date</span>
                      <strong>{{ formatDate(item.release_date) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Price</span>
                      <strong>{{ formatPrice(item.price) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Countdown</span>
                      <strong>{{ daysUntil(item.release_date) }}</strong>
                    </div>
                  </div>

                  <div class="release-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(item.id) }"
                      type="button"
                      :disabled="actionBusyId === item.id || loadingFavorites"
                      @click="toggleFavorite(item.id)"
                    >
                      <span class="button-inner">
                        <span v-if="actionBusyId === item.id" class="button-spinner"></span>
                        <span>{{ isFavorite(item.id) ? 'Saved' : 'Save drop' }}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </article>
            </section>
          </main>
        </div>
      `
    }).mount('#app');
  } catch (error) {
    console.error('App boot error:', error.message, error);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#070b16;color:#f8fafc;font-family:Inter,system-ui,sans-serif;">
          <div style="max-width:560px;padding:24px;border-radius:28px;background:rgba(17,24,39,0.88);border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 70px rgba(0,0,0,0.34);">
            <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#8bdcfb;margin-bottom:12px;">Sole Drop Radar</div>
            <h1 style="margin:0 0 12px;font-size:48px;line-height:0.98;">The app hit a loading issue.</h1>
            <p style="margin:0;color:rgba(232,238,255,0.78);font-size:18px;line-height:1.6;">Please refresh the page. If it keeps happening, the latest script update may need another pass.</p>
          </div>
        </div>
      `;
    }
  }
})();