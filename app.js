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
            authNotice.value = 'Signed in, but we could not load favorites yet.';
            favorites.value = [];
          } finally {
            loadingFavorites.value = false;
          }
        }

        async function hydrateSignedInState(currentUser, options = {}) {
          const { notice = 'Signed in successfully.' } = options;
          user.value = currentUser;
          authError.value = '';
          authNotice.value = notice;
          screen.value = 'app';
          await ensureAppUser(currentUser);
          await Promise.all([loadReleases(), loadFavorites()]);
          clearAuthForm({ keepEmail: true });
        }

        async function syncSessionFromClient(options = {}) {
          const { notice = '', allowSignedOut = true } = options;
          const token = nextTransitionToken();
          authEventInFlight.value = true;
          try {
            const { data, error } = await client.auth.getSession();
            if (!isLatestTransition(token)) return;
            if (error && !isMissingSessionError(error)) throw error;
            const sessionUser = data?.session?.user || null;
            if (sessionUser) {
              await hydrateSignedInState(sessionUser, {
                notice: notice || 'Signed in successfully.'
              });
            } else if (allowSignedOut) {
              applySignedOutState({
                notice: notice || 'Sign in to save favorites.',
                keepEmail: true,
                mode: 'signin'
              });
              await loadReleases();
            }
          } finally {
            if (isLatestTransition(token)) {
              authEventInFlight.value = false;
            }
          }
        }

        async function handleAuthSubmit() {
          if (authBusy.value || signingOut.value) return;
          resetAuthFeedback();

          const trimmedEmail = email.value.trim();
          if (!trimmedEmail || !password.value) {
            authError.value = 'Enter both email and password.';
            return;
          }

          authBusy.value = true;
          const token = nextTransitionToken();

          try {
            if (authMode.value === 'signup') {
              const { error } = await client.auth.signUp({
                email: trimmedEmail,
                password: password.value,
                options: {
                  emailRedirectTo: EMAIL_REDIRECT
                }
              });

              if (error) {
                const message = String(error.message || '').toLowerCase();
                if (message.includes('already been registered') || message.includes('user already registered')) {
                  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
                    email: trimmedEmail,
                    password: password.value
                  });
                  if (signInError) {
                    authError.value = 'Incorrect password for this existing account.';
                    return;
                  }
                  if (!isLatestTransition(token)) return;
                  await hydrateSignedInState(signInData.user, {
                    notice: 'Signed in successfully.'
                  });
                  return;
                }
                throw error;
              }

              if (!isLatestTransition(token)) return;
              screen.value = 'check-email';
              authNotice.value = 'Account created. Check your inbox to confirm your email.';
              clearAuthForm({ keepEmail: true });
              return;
            }

            const { data, error } = await client.auth.signInWithPassword({
              email: trimmedEmail,
              password: password.value
            });

            if (error) {
              const message = String(error.message || '').toLowerCase();
              if (message.includes('email not confirmed')) {
                authError.value = 'Please check your email and click the confirmation link first.';
                return;
              }
              throw error;
            }

            if (!isLatestTransition(token)) return;
            await hydrateSignedInState(data.user, {
              notice: 'Signing in successfully.'
            });
          } catch (error) {
            console.error('Auth submit error:', error.message, error);
            authError.value = error?.message || 'We could not complete that request.';
          } finally {
            if (isLatestTransition(token)) {
              authBusy.value = false;
            }
          }
        }

        async function handleLogout() {
          if (signingOut.value || authBusy.value) return;
          signingOut.value = true;
          const token = nextTransitionToken();
          applySignedOutState({
            notice: 'Logged out successfully.',
            keepEmail: true,
            mode: 'signin'
          });

          try {
            const { error } = await client.auth.signOut();
            if (error && !isMissingSessionError(error)) {
              throw error;
            }
          } catch (error) {
            console.error('Logout error:', error.message, error);
            authNotice.value = 'Logged out locally. Refresh if your session still appears active.';
          } finally {
            if (isLatestTransition(token)) {
              signingOut.value = false;
              authBusy.value = false;
              authEventInFlight.value = false;
            }
            await loadReleases();
          }
        }

        async function toggleFavorite(item) {
          if (!user.value) {
            authNotice.value = 'Sign in to save favorites.';
            screen.value = 'signin';
            authMode.value = 'signin';
            return;
          }
          if (actionBusyId.value) return;

          actionBusyId.value = item.id;
          try {
            const existing = favorites.value.find((entry) => entry.release_id === item.id);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
              favorites.value = favorites.value.filter((entry) => entry.id !== existing.id);
              authNotice.value = 'Removed from favorites.';
            } else {
              const { data, error } = await client
                .from(FAVORITES_TABLE)
                .insert({ release_id: item.id })
                .select('id, release_id')
                .single();
              if (error) throw error;
              favorites.value = [data, ...favorites.value];
              authNotice.value = 'Saved to favorites.';
            }
          } catch (error) {
            console.error('Favorite toggle error:', error.message, error);
            authNotice.value = 'Could not update favorites right now.';
          } finally {
            actionBusyId.value = '';
          }
        }

        function favoriteButtonLabel(item) {
          if (actionBusyId.value === item.id) {
            return isFavorite(item.id) ? 'Removing...' : 'Saving...';
          }
          return isFavorite(item.id) ? 'Favorited' : 'Save favorite';
        }

        onMounted(async () => {
          try {
            const { data, error } = await client.auth.getSession();
            if (error && !isMissingSessionError(error)) {
              throw error;
            }

            const sessionUser = data?.session?.user || null;
            if (sessionUser) {
              await hydrateSignedInState(sessionUser, {
                notice: 'Welcome back.'
              });
            } else {
              applySignedOutState({
                notice: 'Sign in to save favorites.',
                keepEmail: true,
                mode: 'signin'
              });
              await loadReleases();
            }
          } catch (error) {
            console.error('Initial session load error:', error.message, error);
            applySignedOutState({
              notice: 'Sign in to save favorites.',
              keepEmail: true,
              mode: 'signin'
            });
            await loadReleases();
          } finally {
            authInitialized.value = true;
            booting.value = false;
          }

          client.auth.onAuthStateChange(async (event, session) => {
            if (!authInitialized.value) return;
            if (authEventInFlight.value) return;

            authEventInFlight.value = true;
            try {
              if (event === 'SIGNED_OUT' || !session?.user) {
                applySignedOutState({
                  notice: 'Logged out successfully.',
                  keepEmail: true,
                  mode: 'signin'
                });
                await loadReleases();
                return;
              }

              if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                await hydrateSignedInState(session.user, {
                  notice: event === 'SIGNED_IN' ? 'Signed in successfully.' : 'Session updated.'
                });
              }
            } catch (error) {
              console.error('Auth state change error:', error.message, error);
            } finally {
              authEventInFlight.value = false;
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
          formatDate,
          formatPrice,
          daysUntil,
          imageFor,
          isFavorite,
          switchAuthMode,
          handleAuthSubmit,
          handleLogout,
          toggleFavorite,
          favoriteButtonLabel
        };
      },
      template: `
        <div class="app-shell">
          <div class="bg-glow glow-one"></div>
          <div class="bg-glow glow-two"></div>
          <div class="bg-orb"></div>
          <div class="bg-mesh"></div>

          <div v-if="!appReady" class="screen-center">
            <section class="panel">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>Loading your release board</h2>
              <p class="muted-copy">Checking your session and pulling the latest sneaker drops.</p>
            </section>
          </div>

          <div v-else-if="!signedIn || screen === 'signup' || screen === 'signin' || screen === 'check-email'" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h1>{{ authTitle }}</h1>
              <p class="muted-copy">{{ authSubtitle }}</p>

              <div v-if="screen === 'check-email'" class="auth-form">
                <div class="form-notice">{{ authNotice || 'Check your email for the confirmation link.' }}</div>
                <button class="secondary-btn" type="button" @click="switchAuthMode('signin')">
                  <span class="button-inner">Go to sign in</span>
                </button>
              </div>

              <form v-else class="auth-form" @submit.prevent="handleAuthSubmit">
                <label>
                  <span>Email</span>
                  <input v-model.trim="email" type="email" autocomplete="email" placeholder="you@example.com" />
                </label>

                <label>
                  <span>Password</span>
                  <input v-model="password" type="password" autocomplete="current-password" placeholder="Enter your password" />
                </label>

                <div v-if="authError" class="form-error">{{ authError }}</div>
                <div v-else-if="authNotice" class="form-notice">{{ authNotice }}</div>

                <button class="primary-btn auth-submit-btn" type="submit" :disabled="authButtonBusy">
                  <span class="button-inner">
                    <span v-if="authButtonBusy" class="button-spinner" aria-hidden="true"></span>
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
                {{ authMode === 'signup' ? 'Already have an account? Sign in' : 'Don\'t have an account? Sign up' }}
              </button>
            </section>
          </div>

          <main v-else class="container">
            <section class="hero-card">
              <div>
                <span class="eyebrow">Sneaker release tracker</span>
                <h1>Catch the next drop before the crowd does.</h1>
                <p class="hero-copy muted-copy">
                  A more artistic radar for launch culture: glowing release cards, fast favorites,
                  live countdown energy, and a cleaner space to track what matters next.
                </p>
              </div>

              <div class="hero-actions">
                <div class="pill">{{ userLabel }}</div>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">All drops</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" @click="filter = 'upcoming'">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" @click="filter = 'favorites'">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" type="button" :disabled="logoutBusy" @click="handleLogout">
                  <span class="button-inner">
                    <span v-if="logoutBusy" class="button-spinner" aria-hidden="true"></span>
                    <span>{{ logoutLabel }}</span>
                  </span>
                </button>
              </div>
            </section>

            <section class="stats-grid">
              <article class="stat-card">
                <span>Releases loaded</span>
                <strong>{{ loadedCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Upcoming drops</span>
                <strong>{{ upcomingCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Favorites saved</span>
                <strong>{{ favoriteCount }}</strong>
              </article>
            </section>

            <section v-if="statusMessage" class="status-banner">
              {{ statusMessage }}
            </section>

            <section v-if="nextDrop" class="status-banner">
              Next drop: <strong>{{ nextDrop.name }}</strong> · {{ formatDate(nextDrop.release_date) }} · {{ daysUntil(nextDrop.release_date) }}
            </section>

            <section class="release-grid">
              <article v-for="item in filteredReleases" :key="item.id" class="release-card">
                <img class="release-image" :src="imageFor(item)" :alt="item.name" />
                <div class="release-content">
                  <div class="release-top">
                    <div>
                      <span class="release-brand">{{ item.brand || 'Sneaker release' }}</span>
                      <h2>{{ item.name }}</h2>
                    </div>
                    <div class="countdown-pill">{{ daysUntil(item.release_date) }}</div>
                  </div>

                  <div class="detail-grid">
                    <div>
                      <span class="detail-label">Release date</span>
                      <strong>{{ formatDate(item.release_date) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Retail price</span>
                      <strong>{{ formatPrice(item.price) }}</strong>
                    </div>
                  </div>

                  <div class="card-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(item.id) }"
                      type="button"
                      :disabled="actionBusyId === item.id"
                      @click="toggleFavorite(item)"
                    >
                      <span class="button-inner">
                        <span v-if="actionBusyId === item.id" class="button-spinner" aria-hidden="true"></span>
                        <span>{{ favoriteButtonLabel(item) }}</span>
                      </span>
                    </button>
                    <div class="status-chip">{{ item.status || 'Tracked' }}</div>
                  </div>
                </div>
              </article>

              <article v-if="!loadingReleases && filteredReleases.length === 0" class="empty-state">
                <span class="eyebrow">Nothing here yet</span>
                <h2>No releases match this view</h2>
                <p class="muted-copy">Try switching filters or check back after more drops are added.</p>
              </article>
            </section>
          </main>
        </div>
      `
    }).mount('#app');
  } catch (error) {
    console.error('App boot error:', error.message, error);
    const root = document.getElementById('app');
    if (root) {
      root.innerHTML = `
        <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#090c16;color:#f8fafc;font-family:Inter,system-ui,sans-serif;">
          <section style="max-width:560px;width:100%;padding:24px;border-radius:24px;background:rgba(17,24,39,0.85);border:1px solid rgba(255,255,255,0.08);box-shadow:0 20px 60px rgba(0,0,0,0.28);">
            <p style="margin:0 0 8px;color:#8bdcfb;text-transform:uppercase;letter-spacing:0.12em;font-size:12px;">Sole Drop Radar</p>
            <h1 style="margin:0 0 12px;font-size:32px;line-height:1.05;">The app hit a loading issue.</h1>
            <p style="margin:0;color:rgba(232,238,255,0.78);">Please refresh the page. If it keeps happening, the latest script update may need another pass.</p>
          </section>
        </main>
      `;
    }
  }
})();
