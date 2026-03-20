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
            favorites.value = [];
          } finally {
            loadingFavorites.value = false;
          }
        }

        async function restoreSignedInState(currentUser, token) {
          user.value = currentUser;
          screen.value = 'app';
          authError.value = '';
          authNotice.value = 'Signed in successfully.';
          clearAuthForm({ keepEmail: true });
          await ensureAppUser(currentUser);
          if (!isLatestTransition(token)) return;
          await loadFavorites();
        }

        async function syncSessionFromClient(reason = 'manual') {
          const token = nextTransitionToken();
          authEventInFlight.value = true;
          try {
            const { data, error } = await client.auth.getUser();
            if (error) {
              if (isMissingSessionError(error)) {
                if (isLatestTransition(token)) {
                  applySignedOutState({
                    notice: reason === 'logout' ? 'Logged out successfully.' : 'Sign in to save favorites.',
                    keepEmail: true,
                    mode: 'signin'
                  });
                }
                return;
              }
              throw error;
            }

            const currentUser = data?.user || null;
            if (!isLatestTransition(token)) return;

            if (currentUser) {
              await restoreSignedInState(currentUser, token);
            } else {
              applySignedOutState({
                notice: reason === 'logout' ? 'Logged out successfully.' : 'Sign in to save favorites.',
                keepEmail: true,
                mode: 'signin'
              });
            }
          } catch (error) {
            console.error('Session sync error:', error.message, error);
            if (isLatestTransition(token)) {
              applySignedOutState({
                notice: 'Sign in to save favorites.',
                keepEmail: true,
                mode: 'signin'
              });
              authError.value = 'We could not verify your session. Please try again.';
            }
          } finally {
            if (isLatestTransition(token)) {
              authEventInFlight.value = false;
              authBusy.value = false;
              signingOut.value = false;
              booting.value = false;
              authInitialized.value = true;
            }
          }
        }

        async function handleAuthSubmit() {
          if (authBusy.value || signingOut.value) return;

          resetAuthFeedback();
          const trimmedEmail = email.value.trim();
          const rawPassword = password.value;

          if (!trimmedEmail || !rawPassword) {
            authError.value = 'Enter both your email and password.';
            return;
          }

          authBusy.value = true;
          email.value = trimmedEmail;

          try {
            if (authMode.value === 'signup') {
              const { error } = await client.auth.signUp({
                email: trimmedEmail,
                password: rawPassword,
                options: {
                  emailRedirectTo: EMAIL_REDIRECT
                }
              });

              if (error) {
                const message = String(error.message || '').toLowerCase();
                if (message.includes('already been registered') || message.includes('user already registered')) {
                  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
                    email: trimmedEmail,
                    password: rawPassword
                  });
                  if (signInError) {
                    authError.value = 'Incorrect password. Try signing in with the right password.';
                    return;
                  }
                  const currentUser = signInData?.user || null;
                  if (!currentUser) {
                    authError.value = 'We could not sign you in. Please try again.';
                    return;
                  }
                  const token = nextTransitionToken();
                  await restoreSignedInState(currentUser, token);
                  return;
                }
                throw error;
              }

              screen.value = 'check-email';
              authNotice.value = 'Account created. Check your email to confirm, then sign in.';
              password.value = '';
              return;
            }

            const { data, error } = await client.auth.signInWithPassword({
              email: trimmedEmail,
              password: rawPassword
            });

            if (error) {
              const message = String(error.message || '').toLowerCase();
              if (message.includes('email not confirmed')) {
                authError.value = 'Please check your email and click the confirmation link first.';
                return;
              }
              throw error;
            }

            const currentUser = data?.user || null;
            if (!currentUser) {
              authError.value = 'We could not sign you in. Please try again.';
              return;
            }

            const token = nextTransitionToken();
            await restoreSignedInState(currentUser, token);
          } catch (error) {
            console.error('Auth submit error:', error.message, error);
            authError.value = error?.message || 'Authentication failed. Please try again.';
          } finally {
            authBusy.value = false;
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

          try {
            const { error } = await client.auth.signOut();
            if (error && !isMissingSessionError(error)) {
              throw error;
            }
          } catch (error) {
            console.error('Logout error:', error.message, error);
            authNotice.value = 'Signed out locally. You can log back in now.';
          } finally {
            signingOut.value = false;
            authBusy.value = false;
            authEventInFlight.value = false;
          }
        }

        async function toggleFavorite(releaseId) {
          if (!user.value) {
            authMode.value = 'signin';
            screen.value = 'signin';
            authNotice.value = 'Sign in required for favorites.';
            return;
          }
          if (actionBusyId.value) return;
          actionBusyId.value = releaseId;
          try {
            const existing = favorites.value.find((item) => item.release_id === releaseId);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
              favorites.value = favorites.value.filter((item) => item.id !== existing.id);
              authNotice.value = 'Removed from favorites.';
            } else {
              const { data, error } = await client
                .from(FAVORITES_TABLE)
                .insert({ release_id: releaseId })
                .select('id, release_id')
                .single();
              if (error) throw error;
              if (data) favorites.value = [data, ...favorites.value];
              authNotice.value = 'Saved to favorites.';
            }
          } catch (error) {
            console.error('Favorite toggle error:', error.message, error);
            authError.value = 'Could not update favorites right now.';
          } finally {
            actionBusyId.value = '';
          }
        }

        function setFilter(nextFilter) {
          filter.value = nextFilter;
        }

        onMounted(async () => {
          try {
            await loadReleases();
            await syncSessionFromClient('boot');

            client.auth.onAuthStateChange(async (event, session) => {
              try {
                if (event === 'SIGNED_OUT') {
                  applySignedOutState({
                    notice: 'Logged out successfully.',
                    keepEmail: true,
                    mode: 'signin'
                  });
                  return;
                }

                if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                  const currentUser = session?.user || null;
                  if (currentUser) {
                    const token = nextTransitionToken();
                    await restoreSignedInState(currentUser, token);
                  } else if (!authBusy.value && !signingOut.value) {
                    applySignedOutState({
                      notice: 'Sign in to save favorites.',
                      keepEmail: true,
                      mode: 'signin'
                    });
                  }
                }
              } catch (error) {
                console.error('Auth state change error:', error.message, error);
              } finally {
                authBusy.value = false;
                signingOut.value = false;
                authInitialized.value = true;
                booting.value = false;
              }
            });
          } catch (error) {
            console.error('App init error:', error.message, error);
            booting.value = false;
            authInitialized.value = true;
            screen.value = 'signin';
            authMode.value = 'signin';
            authError.value = 'The app could not finish loading. Please refresh and try again.';
          }
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
          formatDate,
          formatPrice,
          daysUntil,
          imageFor,
          isFavorite,
          switchAuthMode,
          handleAuthSubmit,
          handleLogout,
          toggleFavorite,
          setFilter
        };
      },
      template: `
        <div class="app-shell">
          <div class="bg-glow glow-one"></div>
          <div class="bg-glow glow-two"></div>

          <main v-if="!appReady" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sneaker release tracker</span>
              <h2>Loading your dashboard</h2>
              <p class="muted-copy">Checking your session and preparing the latest drops.</p>
            </section>
          </main>

          <main v-else-if="!signedIn" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sneaker release tracker</span>
              <h1>{{ authTitle }}</h1>
              <p class="muted-copy">{{ authSubtitle }}</p>

              <div v-if="authNotice" class="status-banner">{{ authNotice }}</div>
              <div v-if="authError" class="form-error">{{ authError }}</div>

              <template v-if="screen === 'check-email'">
                <button class="primary-btn" type="button" @click="switchAuthMode('signin')">Go to sign in</button>
              </template>

              <form v-else class="auth-form" @submit.prevent="handleAuthSubmit">
                <label>
                  <span>Email</span>
                  <input v-model="email" type="email" autocomplete="email" inputmode="email" required />
                </label>
                <label>
                  <span>Password</span>
                  <input v-model="password" type="password" autocomplete="current-password" required />
                </label>
                <button class="primary-btn" type="submit" :disabled="authBusy || signingOut">
                  {{ authButtonLabel }}
                </button>
              </form>

              <button
                v-if="screen !== 'check-email' && authMode === 'signup'"
                class="text-btn"
                type="button"
                @click="switchAuthMode('signin')"
              >
                Already have an account? Sign in
              </button>
              <button
                v-if="screen !== 'check-email' && authMode === 'signin'"
                class="text-btn"
                type="button"
                @click="switchAuthMode('signup')"
              >
                Don't have an account? Sign up
              </button>
            </section>
          </main>

          <main v-else class="container">
            <section class="hero-card">
              <div>
                <span class="eyebrow">Sneaker release tracker</span>
                <h1>Stay ahead of every drop</h1>
                <p class="hero-copy muted-copy">
                  Track launch dates, compare prices, and save the releases you care about most.
                </p>
              </div>
              <div class="hero-actions">
                <span class="pill">{{ userLabel }}</span>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" @click="setFilter('all')">All</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" @click="setFilter('upcoming')">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" @click="setFilter('favorites')">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" type="button" :disabled="signingOut || authBusy" @click="handleLogout">
                  {{ logoutLabel }}
                </button>
              </div>
            </section>

            <div v-if="authNotice" class="status-banner">{{ authNotice }}</div>
            <div v-if="authError" class="form-error" style="margin-top: 1rem;">{{ authError }}</div>
            <div v-if="statusMessage" class="status-banner">{{ statusMessage }}</div>

            <section class="stats-grid">
              <article class="stat-card">
                <span>Total releases</span>
                <strong>{{ loadedCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Upcoming drops</span>
                <strong>{{ upcomingCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Favorites</span>
                <strong>{{ favoriteCount }}</strong>
              </article>
            </section>

            <section v-if="nextDrop" class="panel" style="margin-top: 1rem;">
              <span class="eyebrow">Next drop</span>
              <h2>{{ nextDrop.brand }} {{ nextDrop.name }}</h2>
              <p class="muted-copy">
                Releases {{ formatDate(nextDrop.release_date) }} · {{ formatPrice(nextDrop.price) }} · {{ daysUntil(nextDrop.release_date) }}
              </p>
            </section>

            <section class="release-grid">
              <article v-if="loadingReleases" class="empty-state">
                <span class="eyebrow">Loading</span>
                <h2>Getting the latest releases</h2>
                <p class="muted-copy">Please wait while we load the latest sneaker data.</p>
              </article>

              <article v-else-if="filteredReleases.length === 0" class="empty-state">
                <span class="eyebrow">No results</span>
                <h2>No releases match this view</h2>
                <p class="muted-copy">Try switching filters or saving a few favorites first.</p>
              </article>

              <article v-for="item in filteredReleases" :key="item.id" class="release-card">
                <img class="release-image" :src="imageFor(item)" :alt="item.name" loading="lazy" />
                <div class="release-content">
                  <div class="release-top">
                    <div>
                      <span class="release-brand">{{ item.brand || 'Brand' }}</span>
                      <h2>{{ item.name }}</h2>
                    </div>
                    <span class="countdown-pill">{{ daysUntil(item.release_date) }}</span>
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
                    <div>
                      <span class="detail-label">Colorway</span>
                      <strong>{{ item.colorway || 'TBD' }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Status</span>
                      <span class="status-chip">{{ item.status || 'upcoming' }}</span>
                    </div>
                  </div>

                  <div class="card-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(item.id) }"
                      :disabled="actionBusyId === item.id"
                      @click="toggleFavorite(item.id)"
                    >
                      {{ actionBusyId === item.id ? 'Saving...' : (isFavorite(item.id) ? 'Favorited' : 'Save favorite') }}
                    </button>
                    <span class="muted-copy">{{ item.sku || 'SKU TBD' }}</span>
                  </div>
                </div>
              </article>
            </section>
          </main>
        </div>
      `
    }).mount('#app');
  } catch (error) {
    console.error('Bootstrap error:', error.message, error);
    const root = document.getElementById('app');
    if (root) {
      root.innerHTML = `
        <main style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;background:#090c16;color:#f8fafc;">
          <section style="max-width:520px;width:100%;padding:24px;border-radius:24px;background:rgba(12,18,36,0.85);border:1px solid rgba(255,255,255,0.08);">
            <p style="margin:0 0 8px;color:#8bdcfb;text-transform:uppercase;letter-spacing:0.12em;font-size:12px;">Sneaker release tracker</p>
            <h1 style="margin:0 0 12px;font-size:32px;">Something went wrong</h1>
            <p style="margin:0;color:rgba(232,238,255,0.72);">The app could not start. Please refresh and try again.</p>
          </section>
        </main>
      `;
    }
  }
})();