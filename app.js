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

        function resetAuthFeedback() {
          authError.value = '';
          authNotice.value = '';
        }

        function switchAuthMode(mode) {
          authMode.value = mode;
          screen.value = mode === 'signup' ? 'signup' : 'signin';
          resetAuthFeedback();
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
            favorites.value = [];
          } finally {
            loadingFavorites.value = false;
          }
        }

        async function refreshAppState(currentUser, options = {}) {
          const { notice = '' } = options;
          const token = nextTransitionToken();
          user.value = currentUser || null;

          if (currentUser) {
            screen.value = 'loading';
            try {
              await ensureAppUser(currentUser);
              await Promise.all([loadReleases(), loadFavorites()]);
              if (!isLatestTransition(token)) return;
              screen.value = 'app';
              authMode.value = 'signin';
              authError.value = '';
              if (notice) authNotice.value = notice;
            } catch (error) {
              console.error('Refresh signed-in state error:', error.message, error);
              if (!isLatestTransition(token)) return;
              applySignedOutState({
                notice: '',
                keepEmail: true,
                mode: 'signin'
              });
              authError.value = 'We could not finish signing you in. Please try again.';
            }
          } else {
            resetSessionView();
            screen.value = 'loading';
            await loadReleases();
            if (!isLatestTransition(token)) return;
            applySignedOutState({
              notice: notice || authNotice.value || 'Sign in to save favorites.',
              keepEmail: true,
              mode: 'signin'
            });
          }
        }

        async function submitAuth() {
          resetAuthFeedback();
          if (authBusy.value || signingOut.value) return;
          if (!email.value.trim() || !password.value.trim()) {
            authError.value = 'Please enter both email and password.';
            return;
          }

          authBusy.value = true;
          try {
            if (authMode.value === 'signup') {
              const signupEmail = email.value.trim();
              const signupPassword = password.value;
              const { error } = await client.auth.signUp({
                email: signupEmail,
                password: signupPassword,
                options: { emailRedirectTo: EMAIL_REDIRECT }
              });

              if (error) {
                const message = String(error.message || '').toLowerCase();
                if (message.includes('already been registered') || message.includes('user already registered')) {
                  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
                    email: signupEmail,
                    password: signupPassword
                  });
                  if (signInError) {
                    authError.value = 'Incorrect password for that existing account.';
                    return;
                  }
                  if (signInData?.user) {
                    await refreshAppState(signInData.user, { notice: 'Signed in successfully.' });
                    clearAuthForm({ keepEmail: true });
                  }
                  return;
                }
                throw error;
              }

              clearAuthForm({ keepEmail: true });
              screen.value = 'check-email';
              authNotice.value = `Check your email for a confirmation link sent to ${signupEmail}.`;
              return;
            }

            const { data, error } = await client.auth.signInWithPassword({
              email: email.value.trim(),
              password: password.value
            });

            if (error) {
              const message = String(error.message || 'Unable to sign in.');
              if (message.toLowerCase().includes('email not confirmed')) {
                authError.value = 'Please check your email and click the confirmation link first.';
              } else {
                authError.value = message;
              }
              return;
            }

            if (data?.user) {
              await refreshAppState(data.user, { notice: 'Signed in successfully.' });
              clearAuthForm({ keepEmail: true });
            }
          } catch (error) {
            console.error('Auth error:', error.message, error);
            authError.value = error.message || 'Something went wrong. Please try again.';
          } finally {
            authBusy.value = false;
          }
        }

        async function logout() {
          if (signingOut.value || authBusy.value) return;

          signingOut.value = true;
          authError.value = '';
          authNotice.value = 'Logging out...';

          const preservedEmail = user.value?.email || email.value;
          email.value = preservedEmail || '';
          applySignedOutState({
            notice: 'Logged out successfully.',
            keepEmail: true,
            mode: 'signin'
          });
          email.value = preservedEmail || '';

          try {
            const { error } = await client.auth.signOut();
            if (error && !isMissingSessionError(error)) {
              throw error;
            }
            await loadReleases();
            authNotice.value = 'Logged out successfully.';
          } catch (error) {
            console.error('Logout error:', error.message, error);
            authNotice.value = 'Logged out locally. If another session remains, refresh and try again.';
          } finally {
            signingOut.value = false;
          }
        }

        async function toggleFavorite(releaseId) {
          if (!user.value) {
            authMode.value = 'signin';
            screen.value = 'signin';
            authNotice.value = 'Sign in required to save favorites.';
            return;
          }
          if (actionBusyId.value) return;

          actionBusyId.value = releaseId;
          try {
            const existing = favorites.value.find((item) => item.release_id === releaseId);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
            } else {
              const { error } = await client.from(FAVORITES_TABLE).insert({ release_id: releaseId });
              if (error) throw error;
            }
            await loadFavorites();
          } catch (error) {
            console.error('Favorite toggle error:', error.message, error);
            authNotice.value = 'We could not update favorites right now.';
          } finally {
            actionBusyId.value = '';
          }
        }

        onMounted(async () => {
          try {
            const { data, error } = await client.auth.getSession();
            if (error && !isMissingSessionError(error)) {
              throw error;
            }
            authInitialized.value = true;
            await refreshAppState(data?.session?.user || null, {
              notice: data?.session?.user ? 'Signed in successfully.' : 'Sign in to save favorites.'
            });
          } catch (error) {
            console.error('App init error:', error.message, error);
            authInitialized.value = true;
            await refreshAppState(null, { notice: 'Sign in to save favorites.' });
          } finally {
            booting.value = false;
          }

          client.auth.onAuthStateChange(async (event, session) => {
            try {
              if (!authInitialized.value) return;
              if (event === 'SIGNED_OUT') {
                await refreshAppState(null, { notice: 'Logged out successfully.' });
                return;
              }
              if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
                if (session?.user) {
                  await refreshAppState(session.user, {
                    notice: event === 'TOKEN_REFRESHED' ? 'Session refreshed.' : 'Signed in successfully.'
                  });
                }
              }
            } catch (error) {
              console.error('Auth state change error:', error.message, error);
            } finally {
              booting.value = false;
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
          signedIn,
          appReady,
          filteredReleases,
          nextDrop,
          favoriteCount,
          upcomingCount,
          loadedCount,
          authTitle,
          authSubtitle,
          authButtonLabel,
          userLabel,
          logoutLabel,
          switchAuthMode,
          submitAuth,
          logout,
          toggleFavorite,
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

          <main v-if="screen === 'app' && appReady" class="container">
            <section class="hero-card">
              <div>
                <span class="eyebrow">Sneaker release tracker</span>
                <h1>Sole Drop Radar</h1>
                <p class="hero-copy muted-copy">
                  Track upcoming sneaker releases, save your favorites, and keep your release radar up to date.
                </p>
              </div>

              <div class="hero-actions">
                <span class="pill">{{ userLabel }}</span>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" @click="filter = 'upcoming'">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" @click="filter = 'favorites'">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" @click="logout" :disabled="signingOut || authBusy">
                  {{ logoutLabel }}
                </button>
              </div>
            </section>

            <section v-if="authNotice || statusMessage" class="status-banner">
              {{ authNotice || statusMessage }}
            </section>

            <section class="stats-grid">
              <article class="stat-card">
                <span>Loaded releases</span>
                <strong>{{ loadedCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Upcoming drops</span>
                <strong>{{ upcomingCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Saved favorites</span>
                <strong>{{ favoriteCount }}</strong>
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
                      <p class="muted-copy">{{ nextDrop.brand || 'Brand TBA' }}</p>
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
                </div>
              </article>

              <article v-for="item in filteredReleases" :key="item.id" class="release-card">
                <img class="release-image" :src="imageFor(item)" :alt="item.name" />
                <div class="release-content">
                  <span class="release-brand">{{ item.brand || 'Brand TBA' }}</span>
                  <div class="release-top">
                    <div>
                      <h2>{{ item.name }}</h2>
                      <p class="muted-copy">{{ item.colorway || 'Colorway TBA' }}</p>
                    </div>
                    <span class="countdown-pill">{{ daysUntil(item.release_date) }}</span>
                  </div>
                  <div class="detail-grid">
                    <div>
                      <span class="detail-label">Release date</span>
                      <strong>{{ formatDate(item.release_date) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Retail</span>
                      <strong>{{ formatPrice(item.price) }}</strong>
                    </div>
                  </div>
                  <div class="card-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(item.id) }"
                      :disabled="actionBusyId === item.id || loadingFavorites"
                      @click="toggleFavorite(item.id)"
                    >
                      {{ isFavorite(item.id) ? 'Remove favorite' : 'Save favorite' }}
                    </button>
                    <span class="status-chip">{{ item.status || 'Scheduled' }}</span>
                  </div>
                </div>
              </article>

              <article v-if="!loadingReleases && filteredReleases.length === 0" class="empty-state">
                <h2>No releases match this filter</h2>
                <p class="muted-copy">Try switching tabs or check back soon for new drops.</p>
              </article>
            </section>
          </main>

          <section v-else class="screen-center">
            <div class="auth-card">
              <span class="eyebrow">Sneaker release tracker</span>
              <h2>{{ authTitle }}</h2>
              <p class="muted-copy">{{ authSubtitle }}</p>

              <div v-if="screen === 'check-email'" class="auth-form">
                <button class="primary-btn" @click="switchAuthMode('signin')">Go to sign in</button>
                <button class="text-btn" @click="switchAuthMode('signup')">Use a different email</button>
              </div>

              <form v-else class="auth-form" @submit.prevent="submitAuth">
                <label>
                  Email
                  <input v-model.trim="email" type="email" autocomplete="email" placeholder="you@example.com" />
                </label>
                <label>
                  Password
                  <input v-model="password" type="password" autocomplete="current-password" placeholder="Enter your password" />
                </label>

                <p v-if="authError" class="form-error">{{ authError }}</p>
                <p v-else-if="authNotice" class="muted-copy">{{ authNotice }}</p>

                <button class="primary-btn" type="submit" :disabled="authBusy || signingOut">
                  {{ authButtonLabel }}
                </button>
              </form>

              <button
                v-if="screen !== 'check-email' && authMode === 'signup'"
                class="text-btn"
                @click="switchAuthMode('signin')"
              >
                Already have an account? Sign in
              </button>
              <button
                v-if="screen !== 'check-email' && authMode === 'signin'"
                class="text-btn"
                @click="switchAuthMode('signup')"
              >
                Don't have an account? Sign up
              </button>
            </div>
          </section>
        </div>
      `
    }).mount('#app');
  } catch (error) {
    console.error('App bootstrap error:', error.message, error);
    document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;background:#090c16;color:#f8fafc;font-family:Inter,system-ui,sans-serif;padding:24px;">
        <section style="max-width:560px;background:rgba(12,18,36,0.88);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.28);">
          <p style="margin:0 0 8px;color:#8bdcfb;text-transform:uppercase;letter-spacing:0.12em;font-size:12px;">Sole Drop Radar</p>
          <h1 style="margin:0 0 12px;font-size:28px;">The app hit an error while loading.</h1>
          <p style="margin:0;color:rgba(232,238,255,0.78);line-height:1.6;">Please refresh the page. If the issue keeps happening, the latest script may still be loading.</p>
        </section>
      </main>
    `;
  }
})();