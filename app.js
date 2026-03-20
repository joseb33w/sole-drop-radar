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
            authError.value = error.message || 'Authentication failed.';
          } finally {
            authBusy.value = false;
          }
        }

        async function signOut() {
          if (signingOut.value) return;
          resetAuthFeedback();
          signingOut.value = true;
          statusMessage.value = 'Signing you out...';
          try {
            const { error } = await client.auth.signOut();
            if (error) throw error;
            user.value = null;
            resetSessionView();
            authMode.value = 'signin';
            password.value = '';
            authNotice.value = 'You have been logged out.';
            statusMessage.value = '';
            await refreshAppState(null);
          } catch (error) {
            console.error('Sign out error:', error.message, error);
            statusMessage.value = 'Could not log you out. Please try again.';
          } finally {
            signingOut.value = false;
          }
        }

        async function toggleFavorite(release) {
          if (!user.value) {
            screen.value = 'signin';
            authMode.value = 'signin';
            authNotice.value = 'Please sign in to save favorites.';
            return;
          }

          actionBusyId.value = release.id;
          try {
            const existing = favorites.value.find((item) => item.release_id === release.id);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
              favorites.value = favorites.value.filter((item) => item.id !== existing.id);
            } else {
              const { data, error } = await client
                .from(FAVORITES_TABLE)
                .insert({ release_id: release.id })
                .select('id, release_id')
                .single();
              if (error) throw error;
              if (data) favorites.value = [data, ...favorites.value];
            }
          } catch (error) {
            console.error('Favorite toggle error:', error.message, error);
            statusMessage.value = 'Could not update favorites right now.';
          } finally {
            actionBusyId.value = '';
          }
        }

        onMounted(async () => {
          try {
            const { data, error } = await client.auth.getUser();
            if (error) throw error;
            await refreshAppState(data.user || null);

            client.auth.onAuthStateChange(async (_event, session) => {
              try {
                await refreshAppState(session?.user || null);
              } catch (listenerError) {
                console.error('Auth state change error:', listenerError.message, listenerError);
              }
            });
          } catch (error) {
            console.error('App init error:', error.message, error);
            screen.value = 'signin';
            statusMessage.value = 'We could not verify your session, but you can still sign in.';
            await loadReleases();
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
          formatDate,
          formatPrice,
          daysUntil,
          imageFor,
          isFavorite,
          submitAuth,
          signOut,
          toggleFavorite,
          switchAuthMode
        };
      },
      template: `
        <div class="app-shell">
          <div class="bg-glow glow-one"></div>
          <div class="bg-glow glow-two"></div>

          <section v-if="screen === 'loading'" class="screen-center">
            <div class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>Loading your release radar...</h2>
              <p class="muted-copy">Checking your session and syncing the latest sneaker data.</p>
            </div>
          </section>

          <section v-else-if="screen === 'check-email'" class="screen-center">
            <div class="auth-card">
              <span class="eyebrow">Check your email</span>
              <h2>Confirm your account</h2>
              <p class="muted-copy">
                {{ authNotice || 'We sent a confirmation link to your email. Open it, then come back and sign in.' }}
              </p>
              <button class="primary-btn" type="button" @click="switchAuthMode('signin'); screen = 'signin'">
                Go to sign in
              </button>
            </div>
          </section>

          <section v-else-if="screen === 'signin'" class="screen-center">
            <div class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>{{ authTitle }}</h2>
              <p class="muted-copy">{{ authSubtitle }}</p>
              <form class="auth-form" @submit.prevent="submitAuth">
                <label>
                  Email
                  <input v-model.trim="email" type="email" autocomplete="email" placeholder="you@example.com" />
                </label>
                <label>
                  Password
                  <input v-model="password" type="password" autocomplete="current-password" placeholder="Enter your password" />
                </label>
                <div v-if="authError" class="form-error">{{ authError }}</div>
                <div v-else-if="authNotice" class="status-banner">{{ authNotice }}</div>
                <button class="primary-btn" type="submit" :disabled="authBusy">
                  {{ authButtonLabel }}
                </button>
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
                Do not have an account? Sign up
              </button>
            </div>
          </section>

          <main v-else class="container">
            <header class="hero-card">
              <div class="hero-copy">
                <span class="eyebrow">Sneaker release tracker</span>
                <h1>Stay ahead of every drop.</h1>
                <p class="muted-copy">
                  Browse release dates, save favorites, and keep your personal sneaker radar synced across sessions.
                </p>
              </div>

              <div class="hero-actions">
                <div class="pill">{{ userLabel }}</div>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">All drops</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" @click="filter = 'upcoming'">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" @click="filter = 'favorites'">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" type="button" :disabled="signingOut" @click="signOut">
                  {{ signingOut ? 'Logging out...' : 'Log out' }}
                </button>
              </div>
            </header>

            <div v-if="statusMessage" class="status-banner">{{ statusMessage }}</div>

            <section class="stats-grid">
              <article class="stat-card">
                <span>Loaded releases</span>
                <strong>{{ loadingReleases ? '...' : loadedCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Upcoming pairs</span>
                <strong>{{ loadingReleases ? '...' : upcomingCount }}</strong>
              </article>
              <article class="stat-card">
                <span>Your favorites</span>
                <strong>{{ loadingFavorites ? '...' : favoriteCount }}</strong>
              </article>
            </section>

            <section v-if="nextDrop" class="panel" style="margin-top: 1rem;">
              <span class="eyebrow">Next drop</span>
              <div class="release-top">
                <div>
                  <h2 style="margin-bottom: 0.35rem;">{{ nextDrop.name }}</h2>
                  <p class="muted-copy" style="margin-bottom: 0;">{{ nextDrop.brand }} - {{ formatDate(nextDrop.release_date) }}</p>
                </div>
                <div class="countdown-pill">{{ daysUntil(nextDrop.release_date) }}</div>
              </div>
            </section>

            <section class="release-grid">
              <article v-if="!filteredReleases.length" class="empty-state">
                <span class="eyebrow">No results</span>
                <h2 style="margin-bottom: 0.35rem;">Nothing matches this view yet.</h2>
                <p class="muted-copy" style="margin-bottom: 0;">
                  Try switching filters or check back when more releases are added.
                </p>
              </article>

              <article v-for="release in filteredReleases" :key="release.id" class="release-card">
                <img class="release-image" :src="imageFor(release)" :alt="release.name" loading="lazy" />
                <div class="release-content">
                  <span class="release-brand">{{ release.brand }}</span>
                  <div class="release-top">
                    <div>
                      <h2 style="margin-bottom: 0.35rem;">{{ release.name }}</h2>
                      <p class="muted-copy" style="margin-bottom: 0;">{{ formatDate(release.release_date) }}</p>
                    </div>
                    <div class="countdown-pill">{{ daysUntil(release.release_date) }}</div>
                  </div>

                  <div class="detail-grid">
                    <div>
                      <span class="detail-label">Retail</span>
                      <strong>{{ formatPrice(release.retail_price) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">SKU</span>
                      <strong>{{ release.sku || 'TBD' }}</strong>
                    </div>
                  </div>

                  <div class="card-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(release.id) }"
                      :disabled="actionBusyId === release.id"
                      @click="toggleFavorite(release)"
                    >
                      {{ actionBusyId === release.id ? 'Saving...' : (isFavorite(release.id) ? 'Saved to favorites' : 'Save to favorites') }}
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
    console.error('App bootstrap error:', error.message, error);
    document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;background:#090b12;color:#f8fafc;font-family:Inter,system-ui,sans-serif;padding:1rem;">
        <section style="max-width:560px;background:rgba(12,18,36,0.88);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,0.28);">
          <p style="margin:0 0 0.5rem;color:#8bdcfb;text-transform:uppercase;letter-spacing:0.12em;font-size:0.8rem;">Sole Drop Radar</p>
          <h1 style="margin:0 0 0.75rem;font-size:1.8rem;">Something went wrong while loading the app.</h1>
          <p style="margin:0;color:rgba(232,238,255,0.78);">Please refresh the page. If the issue continues, open the console and share the error.</p>
        </section>
      </main>
    `;
  }
})();