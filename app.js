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
        const authTitle = computed(() => (authMode.value === 'signup' ? 'Create your account' : 'Welcome back'));
        const authSubtitle = computed(() => (
          authMode.value === 'signup'
            ? 'Sign up to save favorite drops and track upcoming releases.'
            : 'Sign in to sync your favorites and keep your release radar up to date.'
        ));
        const authButtonLabel = computed(() => {
          if (authBusy.value) return authMode.value === 'signup' ? 'Creating account...' : 'Signing in...';
          return authMode.value === 'signup' ? 'Create account' : 'Log in';
        });
        const userLabel = computed(() => user.value?.email || 'Signed in');

        function resetAuthFeedback() {
          authError.value = '';
          authNotice.value = '';
        }

        function switchAuthMode(mode) {
          authMode.value = mode;
          resetAuthFeedback();
          if (mode === 'signin' && email.value.trim()) {
            authNotice.value = 'Sign in with your existing account.';
          }
        }

        function resetSessionView() {
          favorites.value = [];
          filter.value = 'all';
          actionBusyId.value = '';
        }

        function isMissingSessionError(error) {
          return !!(
            error && (
              error.name === 'AuthSessionMissingError' ||
              error.__isAuthError === true ||
              String(error.message || '').toLowerCase().includes('auth session missing')
            )
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

        async function refreshAppState(currentUser) {
          user.value = currentUser || null;
          if (currentUser) {
            await ensureAppUser(currentUser);
            await Promise.all([loadReleases(), loadFavorites()]);
            screen.value = 'app';
          } else {
            resetSessionView();
            await loadReleases();
            screen.value = 'signin';
          }
        }

        async function submitAuth() {
          resetAuthFeedback();
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
                const message = error.message || '';
                if (message.includes('already been registered') || message.includes('User already registered')) {
                  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
                    email: signupEmail,
                    password: signupPassword
                  });
                  if (signInError) {
                    authError.value = 'Incorrect password.';
                    return;
                  }
                  authNotice.value = 'Welcome back - you were already registered, so we signed you in.';
                  await refreshAppState(signInData.user);
                  return;
                }
                throw error;
              }

              screen.value = 'check-email';
              authMode.value = 'signin';
              authNotice.value = `Check ${signupEmail} for your confirmation link, then come back here to sign in.`;
              return;
            }

            const { data, error } = await client.auth.signInWithPassword({
              email: email.value.trim(),
              password: password.value
            });

            if (error) {
              if ((error.message || '').includes('Email not confirmed')) {
                authError.value = 'Please check your email and click the confirmation link first.';
                return;
              }
              throw error;
            }

            authNotice.value = 'Signed in successfully.';
            await refreshAppState(data.user);
          } catch (error) {
            console.error('Auth error:', error.message, error);
            authError.value = error.message || 'Unable to complete authentication right now.';
          } finally {
            authBusy.value = false;
          }
        }

        async function handleLogout() {
          if (signingOut.value) return;
          signingOut.value = true;
          authError.value = '';
          authNotice.value = '';
          try {
            const { error } = await client.auth.signOut();
            if (error) throw error;
            user.value = null;
            resetSessionView();
            password.value = '';
            authMode.value = 'signin';
            screen.value = 'signin';
            authNotice.value = 'Logged out successfully.';
            await loadReleases();
          } catch (error) {
            console.error('Logout error:', error.message, error);
            authError.value = error.message || 'Unable to log out right now.';
          } finally {
            signingOut.value = false;
          }
        }

        async function toggleFavorite(release) {
          if (!user.value) {
            authNotice.value = 'Sign in required to save favorites.';
            screen.value = 'signin';
            authMode.value = 'signin';
            return;
          }

          actionBusyId.value = release.id;
          try {
            const existing = favorites.value.find((item) => item.release_id === release.id);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
              favorites.value = favorites.value.filter((item) => item.id !== existing.id);
              authNotice.value = 'Removed from favorites.';
            } else {
              const { data, error } = await client
                .from(FAVORITES_TABLE)
                .insert({ release_id: release.id })
                .select('id, release_id')
                .single();
              if (error) throw error;
              if (data) {
                favorites.value = [data, ...favorites.value];
              }
              authNotice.value = 'Added to favorites.';
            }
          } catch (error) {
            console.error('Favorite action error:', error.message, error);
            authError.value = error.message || 'Could not update favorites right now.';
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
            await refreshAppState(data?.session?.user || null);
          } catch (error) {
            console.error('App init error:', error.message, error);
            statusMessage.value = 'Could not restore your session, but you can still browse releases.';
            await refreshAppState(null);
          }

          client.auth.onAuthStateChange(async (_event, session) => {
            try {
              await refreshAppState(session?.user || null);
            } catch (error) {
              console.error('Auth state sync error:', error.message, error);
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
          filteredReleases,
          nextDrop,
          favoriteCount,
          upcomingCount,
          loadedCount,
          signedIn,
          authTitle,
          authSubtitle,
          authButtonLabel,
          userLabel,
          switchAuthMode,
          submitAuth,
          handleLogout,
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

          <main v-if="screen === 'loading'" class="screen-center">
            <section class="panel">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>Loading your release feed...</h2>
              <p class="muted-copy">Checking your session and syncing the latest sneaker drops.</p>
            </section>
          </main>

          <main v-else-if="screen === 'check-email'" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Check your email</span>
              <h2>Confirm your account</h2>
              <p class="muted-copy">We sent a confirmation link to {{ email }}. Open it, then come back here and sign in.</p>
              <button class="secondary-btn" @click="switchAuthMode('signin'); screen = 'signin'">Go to sign in</button>
            </section>
          </main>

          <main v-else-if="screen === 'signin'" class="screen-center">
            <section class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>{{ authTitle }}</h2>
              <p class="muted-copy">{{ authSubtitle }}</p>

              <form class="auth-form" @submit.prevent="submitAuth">
                <label>
                  Email
                  <input v-model.trim="email" type="email" placeholder="you@example.com" autocomplete="email" />
                </label>
                <label>
                  Password
                  <input v-model="password" type="password" placeholder="Enter your password" autocomplete="current-password" />
                </label>
                <div v-if="authError" class="form-error">{{ authError }}</div>
                <div v-else-if="authNotice" class="status-banner">{{ authNotice }}</div>
                <button class="primary-btn" type="submit" :disabled="authBusy">{{ authButtonLabel }}</button>
              </form>

              <button
                v-if="authMode === 'signup'"
                class="text-btn"
                type="button"
                @click="switchAuthMode('signin')"
              >
                Already have an account? Sign in
              </button>
              <button
                v-else
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
                <h1>Stay ahead of every drop.</h1>
                <p class="hero-copy muted-copy">
                  Browse upcoming releases, keep tabs on countdowns, and save your favorites to your personal radar.
                </p>
                <div v-if="nextDrop" class="pill">
                  Next up: {{ nextDrop.brand }} {{ nextDrop.name }} - {{ daysUntil(nextDrop.release_date) }}
                </div>
              </div>

              <div class="hero-actions">
                <div class="pill">Signed in as {{ userLabel }}</div>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">All drops</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" @click="filter = 'upcoming'">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" @click="filter = 'favorites'">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" @click="handleLogout" :disabled="signingOut">
                  {{ signingOut ? 'Logging out...' : 'Log out' }}
                </button>
              </div>
            </section>

            <section v-if="authNotice || statusMessage" class="status-banner">
              {{ authNotice || statusMessage }}
            </section>

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

            <section class="release-grid">
              <article v-if="loadingReleases" class="empty-state">
                <span class="eyebrow">Loading</span>
                <h2>Fetching the latest drops...</h2>
                <p class="muted-copy">Your release feed is syncing with the backend.</p>
              </article>

              <article v-else-if="filteredReleases.length === 0" class="empty-state">
                <span class="eyebrow">Nothing here yet</span>
                <h2>No releases match this filter.</h2>
                <p class="muted-copy">Try switching filters or add a favorite once more releases are available.</p>
              </article>

              <article v-else v-for="release in filteredReleases" :key="release.id" class="release-card">
                <img class="release-image" :src="imageFor(release)" :alt="release.name" />
                <div class="release-content">
                  <div class="release-top">
                    <div>
                      <span class="release-brand">{{ release.brand || 'Sneaker drop' }}</span>
                      <h2>{{ release.name || 'Untitled release' }}</h2>
                    </div>
                    <div class="countdown-pill">{{ daysUntil(release.release_date) }}</div>
                  </div>

                  <p class="muted-copy">{{ release.description || 'No description available yet.' }}</p>

                  <div class="detail-grid">
                    <div>
                      <span class="detail-label">Release date</span>
                      <strong>{{ formatDate(release.release_date) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Retail price</span>
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
                      {{ isFavorite(release.id) ? 'Favorited' : 'Add to favorites' }}
                    </button>
                    <div class="status-chip">{{ release.status || 'scheduled' }}</div>
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
  }
})();