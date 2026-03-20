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
        const statusMessage = ref('');
        const releases = ref([]);
        const favorites = ref([]);
        const filter = ref('all');
        const loadingReleases = ref(false);
        const loadingFavorites = ref(false);
        const actionBusyId = ref('');
        const user = ref(null);

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
            favorites.value = [];
            await loadReleases();
            screen.value = 'signin';
          }
        }

        async function submitAuth() {
          authError.value = '';
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
                  await refreshAppState(signInData.user);
                  return;
                }
                throw error;
              }

              screen.value = 'check-email';
              authMode.value = 'signin';
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
            await refreshAppState(data.user);
          } catch (error) {
            console.error('Auth error:', error.message, error);
            authError.value = error.message || 'Authentication failed.';
          } finally {
            authBusy.value = false;
          }
        }

        async function signOut() {
          try {
            await client.auth.signOut();
            user.value = null;
            favorites.value = [];
            screen.value = 'signin';
          } catch (error) {
            console.error('Sign out error:', error.message, error);
          }
        }

        async function toggleFavorite(release) {
          if (!user.value) {
            screen.value = 'signin';
            return;
          }

          actionBusyId.value = release.id;
          try {
            const existing = favorites.value.find((item) => item.release_id === release.id);
            if (existing) {
              const { error } = await client.from(FAVORITES_TABLE).delete().eq('id', existing.id);
              if (error) throw error;
            } else {
              const { error } = await client.from(FAVORITES_TABLE).insert({ release_id: release.id });
              if (error) throw error;
            }
            await loadFavorites();
          } catch (error) {
            console.error('Favorite toggle error:', error.message, error);
            statusMessage.value = 'Could not update favorites right now.';
          } finally {
            actionBusyId.value = '';
          }
        }

        async function init() {
          try {
            const { data } = await client.auth.getUser();
            await refreshAppState(data.user);
            client.auth.onAuthStateChange(async (_event, session) => {
              try {
                await refreshAppState(session?.user || null);
              } catch (error) {
                console.error('Auth state change error:', error.message, error);
              }
            });
          } catch (error) {
            console.error('Init error:', error.message, error);
            statusMessage.value = 'The app could not start correctly.';
            screen.value = 'signin';
            await loadReleases();
          }
        }

        onMounted(() => {
          init();
        });

        return {
          screen,
          authMode,
          email,
          password,
          authError,
          authBusy,
          statusMessage,
          releases,
          favorites,
          filter,
          loadingReleases,
          loadingFavorites,
          actionBusyId,
          user,
          filteredReleases,
          nextDrop,
          favoriteCount,
          upcomingCount,
          loadedCount,
          signedIn,
          formatDate,
          formatPrice,
          daysUntil,
          imageFor,
          isFavorite,
          submitAuth,
          signOut,
          toggleFavorite
        };
      },
      template: `
        <div class="app-shell">
          <div class="bg-glow glow-one"></div>
          <div class="bg-glow glow-two"></div>

          <section v-if="screen === 'loading'" class="screen-center">
            <div class="panel">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>Loading your release feed...</h2>
              <p class="muted-copy">Connecting to your sneaker release backend.</p>
            </div>
          </section>

          <section v-else-if="screen === 'check-email'" class="screen-center">
            <div class="auth-card">
              <span class="eyebrow">Check your email</span>
              <h2>Confirm your account</h2>
              <p class="muted-copy">
                We sent a confirmation link to <strong>{{ email }}</strong>. Click the link, then come back and sign in.
              </p>
              <button class="primary-btn" @click="screen = 'signin'">Go to Sign In</button>
            </div>
          </section>

          <section v-else-if="screen === 'signin' || screen === 'signup'" class="screen-center">
            <div class="auth-card">
              <span class="eyebrow">Sole Drop Radar</span>
              <h2>{{ authMode === 'signup' ? 'Create your account' : 'Sign in to your account' }}</h2>
              <p class="muted-copy">
                Save favorite drops, watch upcoming releases, and keep your sneaker radar synced.
              </p>

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
                <button class="primary-btn" type="submit" :disabled="authBusy">
                  {{ authBusy ? 'Please wait...' : authMode === 'signup' ? 'Sign Up' : 'Sign In' }}
                </button>
              </form>

              <button
                class="text-btn"
                type="button"
                @click="authMode = authMode === 'signup' ? 'signin' : 'signup'"
              >
                {{ authMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up" }}
              </button>
            </div>
          </section>

          <main v-else class="container">
            <section class="hero-card">
              <div>
                <span class="eyebrow">Sneaker release tracker</span>
                <h1>Watch real drops, save favorites, and stay release ready.</h1>
                <p class="hero-copy muted-copy">
                  Browse real sneaker release entries from your backend, track upcoming launches, and keep a personal shortlist of pairs you want to grab.
                </p>
              </div>

              <div class="hero-actions">
                <div class="pill">Signed in as {{ user?.email }}</div>
                <div class="toggle-row">
                  <button class="tab-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">All Drops</button>
                  <button class="tab-btn" :class="{ active: filter === 'upcoming' }" @click="filter = 'upcoming'">Upcoming</button>
                  <button class="tab-btn" :class="{ active: filter === 'favorites' }" @click="filter = 'favorites'">Favorites</button>
                </div>
                <button class="secondary-btn logout-btn" @click="signOut">Log Out</button>
              </div>
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
                <span>Your favorites</span>
                <strong>{{ favoriteCount }}</strong>
              </article>
            </section>

            <section v-if="nextDrop" class="status-banner">
              <strong>Next drop:</strong>
              {{ nextDrop.brand }} {{ nextDrop.name }} · {{ formatDate(nextDrop.release_date) }} · {{ daysUntil(nextDrop.release_date) }}
            </section>

            <section v-if="statusMessage" class="status-banner">
              {{ statusMessage }}
            </section>

            <section class="release-grid">
              <article v-if="loadingReleases" class="empty-state">
                <span class="eyebrow">Loading</span>
                <h2>Fetching releases...</h2>
                <p class="muted-copy">Please wait while we load the latest sneaker entries from your backend.</p>
              </article>

              <article v-else-if="filteredReleases.length === 0" class="empty-state">
                <span class="eyebrow">No results</span>
                <h2>No releases match this filter</h2>
                <p class="muted-copy">Try switching filters or add favorites once releases are available.</p>
              </article>

              <article v-else v-for="release in filteredReleases" :key="release.id" class="release-card">
                <img class="release-image" :src="imageFor(release)" :alt="release.brand + ' ' + release.name" @error="$event.target.src='https://placehold.co/1200x800/111827/f8fafc?text=Sole+Drop+Radar'" />
                <div class="release-content">
                  <div class="release-top">
                    <div>
                      <span class="release-brand">{{ release.brand }}</span>
                      <h2>{{ release.name }}</h2>
                    </div>
                    <div class="countdown-pill">{{ daysUntil(release.release_date) }}</div>
                  </div>

                  <div class="detail-grid">
                    <div>
                      <span class="detail-label">Release Date</span>
                      <strong>{{ formatDate(release.release_date) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Retail</span>
                      <strong>{{ formatPrice(release.retail_price) }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">SKU</span>
                      <strong>{{ release.sku || 'TBD' }}</strong>
                    </div>
                    <div>
                      <span class="detail-label">Status</span>
                      <strong class="status-chip">{{ release.status || 'scheduled' }}</strong>
                    </div>
                  </div>

                  <div class="card-actions">
                    <button
                      class="favorite-btn"
                      :class="{ active: isFavorite(release.id) }"
                      :disabled="actionBusyId === release.id || loadingFavorites"
                      @click="toggleFavorite(release)"
                    >
                      {{ isFavorite(release.id) ? 'Remove Favorite' : 'Add to Favorites' }}
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
    console.error('Boot error:', error.message, error.stack);
    const root = document.getElementById('app');
    if (root) {
      root.innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;background:#090b12;color:#f8fafc;font-family:Inter,system-ui,sans-serif;padding:24px;">
          <div style="max-width:560px;background:rgba(12,18,36,0.86);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.28);">
            <div style="text-transform:uppercase;letter-spacing:.12em;font-size:.76rem;color:#8bdcfb;margin-bottom:8px;">Sole Drop Radar</div>
            <h1 style="margin:0 0 12px;font-size:28px;">The app hit a startup error.</h1>
            <p style="margin:0;color:rgba(232,238,255,.78);line-height:1.6;">Check the browser console for details. The repo was rebuilt to use plain files instead of stale hashed assets, so if you still see an error it is likely backend-related.</p>
          </div>
        </div>
      `;
    }
  }
})();
