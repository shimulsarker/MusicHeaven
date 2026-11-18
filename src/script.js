    const audio = document.getElementById("audio");
    const isAndroidPlatform = /Android/i.test(navigator.userAgent);
    document.body.classList.toggle("android-platform", isAndroidPlatform);
    const mediaSession = "mediaSession" in navigator ? navigator.mediaSession : null;
    const defaultMediaArtwork = new URL("./favicon.png", document.baseURI).href;
    const stage = document.getElementById("stage");
    const playButton = document.getElementById("play");
    const seek = document.getElementById("seek");
    const nowPlayingSeek = document.getElementById("now-playing-seek");
    const elapsed = document.getElementById("elapsed");
    const duration = document.getElementById("duration");
    const demoTracks = Array.from({ length: 11 }, (_, i) => ({
      id: `demo-${i}`,
      title: i === 0 ? "Mon Majhi Re" : `Track ${String(i + 1).padStart(2, "0")}`,
      artist: i === 0 ? "Arijit Singh" : "Artist Name",
      time: i === 0 ? "4:30" : ["3:45", "4:12", "3:28", "5:06", "3:52", "4:21", "3:37", "4:48", "3:59", "4:16"][i - 1],
      src: i === 0 ? "Arijit_Singh__Mon_Majhi_Re__Full_HD_Video_Song___Boss_Bengali_Movie___Jeet___Sub.mp3" : ""
    }));
    let tracks = demoTracks.map((track) => ({ ...track }));
    let activeTrack = 0;
    let shuffleOn = false;
    let shuffleQueue = [];
    let repeatMode = "off";
    let toastTimer;
    let nowPlayingCloseTimer;
    let audioContext;
    let audioSource;
    let outputGain;
    let mixFadeScheduledForTrack = null;
    let eqFilters = [];
    let eqSaveTimer;
    let importGeneration = 0;
    let importedObjectUrls = [];
    let lastFmAuthToken = "";
    let lastFmNowPlayingTrackId = "";
    let lastFmScrobbledTrackId = "";
    let lastFmTrackStartedAt = 0;
    let lastFmBackendStatus = { available: false, checked: false, lastFmSecretConfigured: false };
    let youtubeAccessToken = "";
    let youtubeTokenClient;
    let youtubeClientScriptPromise;
    let youtubeOAuthReady = false;
    let youtubeOAuthLoading = false;
    let youtubeSyncInProgress = false;
    const playlistStorageKey = "musicHeaven.playlist.v1";
    const settingsStorageKey = "musicHeaven.settings.v1";
    const defaultEqValues = [2.7, 2.2, 0.6, -2.6, -0.6, 1.2, 3, 4, 4.3, 4.8];
    const eqPresetNames = [
      "Default", "Studio Master", "Vocal Clarity", "Deep Bass Clean", "Bass Boost",
      "Warm", "Bright", "Late Night", "Rock", "Pop", "Electronic", "R&B",
      "Acoustic", "Classical", "Jazz", "Treble Air", "Speech / Podcast"
    ];
    const audioProfileNames = ["Reference", "Speaker", "Headphone", "DAC"];
    const defaultSettings = {
      backgroundPlayback: true,
      autoplayNext: true,
      rememberVolume: true,
      equalizerEnabled: true,
      clarityEnabled: true,
      audioProfile: "Reference",
      eqValues: defaultEqValues,
      eqActivePreset: "Studio Master",
      eqPresetPill: "Studio Master",
      eqResetValues: defaultEqValues,
      eqResetPreset: "Studio Master",
      eqResetPill: "Studio Master",
      compactLibrary: false,
      showMetadata: true,
      highlightLyrics: true,
      verboseLogging: false,
      favoriteTrackIds: [],
      accentColor: "#3ea6ff",
      defaultVolume: .72,
      timedMix: false,
      androidDirectPlayback: true,
      downloadLyrics: true,
      downloadLocation: "Default location",
      folderLayout: "Flat",
      podcasts: true,
      youtubeMusicSync: false,
      hiddenTrackIds: [],
      theme: "Midnight",
      customAccentColor: "#3ea6ff",
      hazeMaterial: "Automatic",
      hazeIntensity: "Medium",
      nowPlayingAmbient: "Apple Music",
      amoledBlack: false,
      dynamicArtworkTheme: false,
      lastFmApiKey: "",
      lastFmScrobbling: false,
      lastFmNowPlaying: true,
      lastFmThreshold: 50,
      lastFmSessionKey: "",
      lastFmUsername: "",
      integrationsBackendUrl: "",
      youtubeConnected: false,
      youtubeOAuthClientId: "",
      youtubePlaylistId: "",
      youtubeSyncedTrackIds: [],
      spotifyConnected: false,
      spotifyCanvas: true,
      discordRichPresence: true,
      addonSources: []
    };
    let settingsState = { ...defaultSettings };
    try {
      const savedSettings = JSON.parse(localStorage.getItem(settingsStorageKey) || "null");
      if (savedSettings && typeof savedSettings === "object" && !Array.isArray(savedSettings)) {
        settingsState = { ...defaultSettings, ...savedSettings };
      }
    } catch (error) {
      console.warn("Saved settings could not be read:", error);
    }
    let settingsMigrated = false;
    ["lastFmSharedSecret", "youtubeHistorySync"].forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(settingsState, key)) return;
      delete settingsState[key];
      settingsMigrated = true;
    });
    if (settingsMigrated) {
      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(settingsState));
      } catch (error) {
        console.warn("Legacy integration settings could not be removed from browser storage:", error);
      }
    }
    ["backgroundPlayback", "autoplayNext", "rememberVolume", "equalizerEnabled", "clarityEnabled",
      "compactLibrary", "showMetadata", "highlightLyrics", "verboseLogging", "timedMix", "androidDirectPlayback",
      "downloadLyrics", "podcasts", "youtubeMusicSync", "amoledBlack", "dynamicArtworkTheme",
      "lastFmScrobbling", "lastFmNowPlaying", "youtubeConnected",
      "spotifyConnected", "spotifyCanvas", "discordRichPresence"].forEach((key) => {
      if (typeof settingsState[key] !== "boolean") settingsState[key] = defaultSettings[key];
    });
    if (isAndroidPlatform && settingsState.androidDirectPlayback) {
      settingsState.equalizerEnabled = false;
      settingsState.clarityEnabled = false;
      settingsState.timedMix = false;
    }
    settingsState.youtubeConnected = false;
    if (typeof settingsState.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(settingsState.accentColor)) settingsState.accentColor = defaultSettings.accentColor;
    if (typeof settingsState.customAccentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(settingsState.customAccentColor)) settingsState.customAccentColor = settingsState.accentColor;
    if (!["Midnight", "Pearl", "Custom"].includes(settingsState.theme)) settingsState.theme = "Midnight";
    if (!["Automatic", "Solid"].includes(settingsState.hazeMaterial)) settingsState.hazeMaterial = "Automatic";
    if (!["Low", "Medium", "High"].includes(settingsState.hazeIntensity)) settingsState.hazeIntensity = "Medium";
    if (!["Apple Music", "WinUI"].includes(settingsState.nowPlayingAmbient)) settingsState.nowPlayingAmbient = "Apple Music";
    if (!["Flat", "Artist", "Album"].includes(settingsState.folderLayout)) settingsState.folderLayout = "Flat";
    if (!Array.isArray(settingsState.hiddenTrackIds)) settingsState.hiddenTrackIds = [];
    if (!Array.isArray(settingsState.addonSources)) settingsState.addonSources = [];
    if (!Array.isArray(settingsState.youtubeSyncedTrackIds)) settingsState.youtubeSyncedTrackIds = [];
    ["lastFmApiKey", "lastFmSessionKey", "lastFmUsername", "integrationsBackendUrl",
      "youtubeOAuthClientId", "youtubePlaylistId"].forEach((key) => {
      if (typeof settingsState[key] !== "string") settingsState[key] = defaultSettings[key];
    });
    if (!settingsState.lastFmSessionKey) settingsState.lastFmScrobbling = false;
    if (!Number.isFinite(Number(settingsState.lastFmThreshold))) settingsState.lastFmThreshold = 50;
    settingsState.lastFmThreshold = Math.max(25, Math.min(90, Number(settingsState.lastFmThreshold)));
    if (typeof settingsState.downloadLocation !== "string") settingsState.downloadLocation = defaultSettings.downloadLocation;
    const normalizeEqValues = (values, fallback) => {
      if (!Array.isArray(values) || values.length !== 10 ||
        values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
        return [...fallback];
      }
      return values.map((value) => Math.max(-12, Math.min(12, value)));
    };
    settingsState.eqValues = normalizeEqValues(settingsState.eqValues, defaultEqValues);
    settingsState.eqResetValues = normalizeEqValues(settingsState.eqResetValues, defaultEqValues);
    if (!eqPresetNames.includes(settingsState.eqActivePreset) && settingsState.eqActivePreset !== "Custom") {
      settingsState.eqActivePreset = defaultSettings.eqActivePreset;
    }
    if (settingsState.eqPresetPill !== null && !eqPresetNames.includes(settingsState.eqPresetPill)) {
      settingsState.eqPresetPill = settingsState.eqActivePreset === "Custom" ? null : settingsState.eqActivePreset;
    }
    if (!eqPresetNames.includes(settingsState.eqResetPreset)) settingsState.eqResetPreset = defaultSettings.eqResetPreset;
    if (settingsState.eqResetPill !== null && !eqPresetNames.includes(settingsState.eqResetPill)) {
      settingsState.eqResetPill = settingsState.eqResetPreset;
    }
    if (!audioProfileNames.includes(settingsState.audioProfile)) settingsState.audioProfile = defaultSettings.audioProfile;
    if (!Number.isFinite(Number(settingsState.defaultVolume))) settingsState.defaultVolume = defaultSettings.defaultVolume;
    settingsState.defaultVolume = Math.max(0, Math.min(1, Number(settingsState.defaultVolume)));
    if (!Array.isArray(settingsState.favoriteTrackIds)) settingsState.favoriteTrackIds = [];
    settingsState.favoriteTrackIds = Array.from(new Set(
      settingsState.favoriteTrackIds.filter((id) => typeof id === "string" && id.length > 0)
    ));
    const favoriteTrackIds = new Set(settingsState.favoriteTrackIds);
    let diagnosticLogs = [];
    let activeSettingsCategory = "General";
    let currentLyrics = [];
    let currentLyricsTrackId = null;
    let activeLyricIndex = -1;
    const libraryCategories = ["Songs", "Artists", "Albums", "Genres", "Folders", "Liked Songs"];
    let activeLibraryCategory = "Songs";
    let libraryFolderName = "";
    let activeFolderSelection = null;
    let playbackTrackIndices = tracks.map((track, index) => index);
    const groupedTracksCache = new Map();
    const parsedTrackMetadataCache = new WeakMap();
    let libraryRevision = 0;
    let librarySearchTextCache = new WeakMap();
    let libraryRenderToken = 0;
    let libraryRefreshScheduled = false;
    let libraryListRefreshRequested = false;
    let libraryCacheInvalidationRequested = false;
    let importedFolderStructures = [];
    let playlistDatabase;
    let downloadDirectoryHandle = null;
    let artworkAccentRequest = 0;
    let activeNavigationView = "home";
    let activeMoodFilter = "All";
    let featuredTrackIndex = 0;
    let lastMobileScrollTop = 0;
    document.body.classList.add("home-view");

    function updateMobileNavigation() {
      const activeTab = activeNavigationView === "home"
        ? "home"
        : activeNavigationView === "library" && activeLibraryCategory === "Folders"
          ? "folder"
          : "library";
      document.querySelectorAll("[data-mobile-tab]").forEach((button) => {
        const selected = button.dataset.mobileTab === activeTab;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-current", selected ? "page" : "false");
      });
    }

    function setActiveNavigationView(view) {
      activeNavigationView = view;
      document.body.classList.toggle("home-view", view === "home");
      if (view !== "home") document.body.classList.remove("mobile-dock-collapsed");
      updateMobileNavigation();
    }

    function updateGreeting() {
      const currentHour = new Date().getHours();
      const greeting = currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";
      document.getElementById("greeting-title").textContent = greeting;
      document.getElementById("greeting-date").textContent = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
      }).toUpperCase();
    }

    const eqBands = [
      { frequency: 31, label: "31", value: 2.7 },
      { frequency: 63, label: "63", value: 2.2 },
      { frequency: 125, label: "125", value: 0.6 },
      { frequency: 250, label: "250", value: -2.6 },
      { frequency: 500, label: "500", value: -0.6 },
      { frequency: 1000, label: "1k", value: 1.2 },
      { frequency: 2000, label: "2k", value: 3.0 },
      { frequency: 4000, label: "4k", value: 4.0 },
      { frequency: 8000, label: "8k", value: 4.3 },
      { frequency: 16000, label: "16k", value: 4.8 }
    ];
    const eqPresets = [
      { name: "Default", values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { name: "Studio Master", values: eqBands.map((band) => band.value) },
      { name: "Vocal Clarity", values: [-1.4, -1.1, -.6, .3, 1.8, 2.7, 3.1, 2.5, 1.4, .4] },
      { name: "Deep Bass Clean", values: [3, 2.6, 2, .8, -.5, -.4, .2, .6, .7, .5] },
      { name: "Bass Boost", values: [5, 4.2, 3, 1.7, .3, 0, 0, 0, 0, 0] },
      { name: "Warm", values: [2.5, 2, .8, -.2, -.4, .4, 1.2, 1.5, 1, .6] },
      { name: "Bright", values: [-1, -.5, 0, -.2, .4, 1, 2, 3, 3.8, 4] },
      { name: "Late Night", values: [2, 1.5, .8, 0, 1.6, 2.2, 1.4, .4, -.4, -1] },
      { name: "Rock", values: [3.5, 2.4, -1.2, -2.2, -1, 1.4, 2.8, 3.2, 3.4, 3] },
      { name: "Pop", values: [-.5, .8, 2, 2.4, .8, -.4, .6, 1.8, 2.2, 2] },
      { name: "Electronic", values: [4, 3.4, 1.2, 0, -1.2, 1.6, .5, 1.7, 3.3, 3.8] },
      { name: "R&B", values: [2.8, 2.2, .8, -.6, -.2, 1.4, 2, 1.3, .4, 1.1] },
      { name: "Acoustic", values: [1.2, .8, .2, -.4, .6, 1.4, 2, 1.8, 1.2, .8] },
      { name: "Classical", values: [2, 1.5, 1, .5, -.5, -.5, 0, .8, 1.2, 1.5] },
      { name: "Jazz", values: [2, 1.5, .5, .8, -.8, -.8, 0, .8, 1.5, 2] },
      { name: "Treble Air", values: [-1, -.5, 0, 0, 0, .5, 1, 2, 3, 4] },
      { name: "Speech / Podcast", values: [-3, -2, -1, 0, 2, 3, 3, 2, .5, -1] }
    ];
    const clarityCurve = [-.4, -.2, 0, .2, .5, .8, .8, .4, 0, -.2];
    const clarityProfiles = {
      Reference: { subBass: 0, presence: 0, air: 0, exciter: 0 },
      Speaker: { subBass: -1.5, presence: 0, air: -.5, exciter: 0 },
      Headphone: { subBass: -.5, presence: -1, air: 0, exciter: 0 },
      DAC: { subBass: 0, presence: 0, air: -1.5, exciter: -1 }
    };
    let eqValues = [...settingsState.eqValues];
    let eqBaseValues = [...eqValues];
    let eqResetValues = [...settingsState.eqResetValues];
    let eqActivePreset = settingsState.eqActivePreset;
    let eqPresetPill = settingsState.eqPresetPill;
    let eqResetPreset = settingsState.eqResetPreset;
    let eqResetPill = settingsState.eqResetPill;
    let clarityEnabled = settingsState.clarityEnabled;
    let activeClarityProfile = settingsState.audioProfile;
    let eqEnabled = settingsState.equalizerEnabled;
    let clarityFilters = [];
    const eqCardHolder = document.getElementById("eq-card-holder");
    const nowPlayingOverlay = document.getElementById("now-playing-overlay");
    const settingsView = document.getElementById("settings-view");

    const icon = (id) => `<svg><use href="#${id}"></use></svg>`;
    const list = document.getElementById("track-list");
    const folderInput = document.getElementById("folder-input");
    const songInput = document.getElementById("song-input");
    const categoryNavigation = document.querySelector(".library-categories");

    function invalidateLibraryCaches() {
      libraryRevision += 1;
      groupedTracksCache.clear();
      librarySearchTextCache = new WeakMap();
    }

    function getTrackSearchText(track) {
      let text = librarySearchTextCache.get(track);
      if (text === undefined) {
        text = `${track.title} ${track.artist} ${track.album} ${track.genre} ${track.folder}`.toLowerCase();
        librarySearchTextCache.set(track, text);
      }
      return text;
    }

    function groupTracksBy(category, trackIndices) {
      const scopeKey = trackIndices ? trackIndices.join(",") : "all";
      const cacheKey = `${libraryRevision}:${category}:${scopeKey}`;
      if (groupedTracksCache.has(cacheKey)) return groupedTracksCache.get(cacheKey);
      const field = {
        Artists: "artist",
        Albums: "album",
        Genres: "genre",
        Folders: "folder"
      }[category];
      const fallbacks = {
        Artists: "Unknown artist",
        Albums: "Unknown album",
        Genres: "Unknown genre",
        Folders: "Unsorted"
      };
      const groups = new Map();
      const addTrack = (index) => {
        const track = tracks[index];
        if (category === "Liked Songs" && !favoriteTrackIds.has(track.id)) return;
        const label = category === "Songs"
          ? "All songs"
          : category === "Liked Songs"
            ? "Liked Songs"
            : (track[field] || fallbacks[category]);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push({ track, index });
      };
      if (trackIndices) trackIndices.forEach(addTrack);
      else tracks.forEach((track, index) => addTrack(index));
      groupedTracksCache.set(cacheKey, groups);
      return groups;
    }

    function renderLibraryCategories() {
      const categoryIcons = {
        Songs: "i-music",
        Artists: "i-users",
        Albums: "i-album",
        Genres: "i-eq",
        Folders: "i-folder",
        "Liked Songs": "i-heart"
      };
      categoryNavigation.replaceChildren();
      libraryCategories.forEach((category) => {
        const button = document.createElement("button");
        button.type = "button";
        const selected = activeNavigationView === "library" && activeLibraryCategory === category;
        button.className = `library-category nav-button${selected ? " active" : ""}`;
        button.dataset.category = category;
        button.setAttribute("aria-label", category);
        button.setAttribute("aria-pressed", String(selected));
        button.innerHTML = `${icon(categoryIcons[category])}<span class="library-category-label"></span>`;
        button.querySelector(".library-category-label").textContent = category;
        categoryNavigation.appendChild(button);
      });
    }

    const moodKeywords = {
      Energize: ["dance", "electronic", "rock", "upbeat", "energetic", "punk", "metal", "workout"],
      Relax: ["ambient", "acoustic", "classical", "jazz", "chill", "calm", "soft", "slow"],
      "Feel good": ["pop", "funk", "soul", "disco", "happy", "feel good", "dance"],
      Workout: ["workout", "rock", "hip hop", "dance", "electronic", "metal", "upbeat"]
    };

    function getHomeRecommendations() {
      const visibleTracks = tracks.map((track, index) => ({ track, index }))
        .filter(({ track }) => !settingsState.hiddenTrackIds.includes(track.id));
      const keywords = moodKeywords[activeMoodFilter];
      if (!keywords) return visibleTracks;
      return visibleTracks.filter(({ track }) => {
        const searchable = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase();
        return keywords.some((keyword) => searchable.includes(keyword));
      });
    }

    function renderHomeSections() {
      const recommendedTracks = getHomeRecommendations();
      const featuredTrack = recommendedTracks[0]?.track || tracks[0];
      featuredTrackIndex = recommendedTracks[0]?.index ?? -1;
      const featuredArt = document.getElementById("featured-art");
      featuredArt.className = `featured-art art-${1}`;
      setArtwork(featuredArt, featuredTrack);
      document.getElementById("featured-title").textContent = recommendedTracks.length
        ? featuredTrack.title
        : activeMoodFilter === "All" ? "No recommendations" : `No ${activeMoodFilter} tracks`;
      document.getElementById("featured-artist").textContent = recommendedTracks.length
        ? featuredTrack.artist
        : "Try another mood or add matching genre tags.";

      const quickPicks = document.getElementById("quick-picks");
      quickPicks.replaceChildren();
      recommendedTracks.slice(0, 9).forEach(({ track, index }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quick-pick";
        button.dataset.track = String(index);
        const art = document.createElement("span");
        art.className = `home-cover art-${index % 8 + 1}`;
        setArtwork(art, track);
        const copy = document.createElement("span");
        copy.className = "pick-copy";
        const title = document.createElement("span");
        title.className = "pick-title";
        title.textContent = track.title;
        const artist = document.createElement("span");
        artist.className = "pick-artist";
        artist.textContent = track.artist;
        copy.append(title, artist);
        const play = document.createElement("span");
        play.className = "quick-pick-play";
        play.innerHTML = icon("i-play");
        button.append(art, copy, play);
        quickPicks.appendChild(button);
      });

      const albums = new Map();
      recommendedTracks.forEach(({ track, index }) => {
        const albumName = track.album && track.album !== "Unknown album" ? track.album : track.title;
        if (!albums.has(albumName)) albums.set(albumName, { track, index });
      });
      const listenAgain = document.getElementById("listen-again");
      listenAgain.replaceChildren();
      Array.from(albums.entries()).slice(0, 8).forEach(([albumName, album], index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "album-card";
        button.dataset.track = String(album.index);
        const art = document.createElement("span");
        art.className = `album-art art-${index % 8 + 1}`;
        setArtwork(art, album.track);
        const title = document.createElement("span");
        title.className = "album-title";
        title.textContent = albumName;
        const artist = document.createElement("span");
        artist.className = "album-artist";
        artist.textContent = album.track.artist;
        const badge = document.createElement("span");
        badge.className = "discover-badge";
        badge.textContent = "DISCOVER";
        button.append(art, badge, title, artist);
        listenAgain.appendChild(button);
      });
    }

    function setArtwork(element, track) {
      const hasArtwork = Boolean(track && track.artwork);
      if (hasArtwork) {
        element.style.backgroundImage = `url("${track.artwork}")`;
      } else {
        element.style.removeProperty("background-image");
      }
      element.classList.toggle("has-artwork", hasArtwork);
      element.classList.toggle("no-artwork", !hasArtwork);
    }

    function updateDynamicArtworkAccent(track) {
      if (!settingsState.dynamicArtworkTheme || !track || !track.artwork) return;
      const requestId = ++artworkAccentRequest;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (requestId !== artworkAccentRequest || !settingsState.dynamicArtworkTheme) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(image, 0, 0, 1, 1);
          const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
          const color = [red, green, blue].map((channel) => Math.max(54, Math.min(220, channel)));
          document.documentElement.style.setProperty("--accent", `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
        } catch (error) {
          console.warn("Artwork theme color could not be sampled:", error);
        }
      };
      image.src = track.artwork;
    }

    function renderSearchResults() {
      const query = document.getElementById("search").value.trim().toLowerCase();
      const dashboard = document.getElementById("home-dashboard");
      const resultsSection = document.getElementById("search-results");
      const resultsList = document.getElementById("search-results-list");
      dashboard.hidden = Boolean(query);
      resultsSection.hidden = !query;
      resultsList.replaceChildren();
      if (!query) return;

      const matches = tracks
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query));
      document.getElementById("search-result-count").textContent =
        `${matches.length} ${matches.length === 1 ? "match" : "matches"}`;
      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "search-empty";
        empty.textContent = "No songs match your search.";
        resultsList.appendChild(empty);
        return;
      }

      matches.forEach(({ track, index }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `search-result${index === activeTrack ? " current" : ""}`;
        button.dataset.track = String(index);
        const cover = document.createElement("span");
        cover.className = `search-result-art art-${index % 8 + 1}`;
        setArtwork(cover, track);
        const copy = document.createElement("span");
        copy.className = "search-result-copy";
        const title = document.createElement("strong");
        title.textContent = track.title;
        const details = document.createElement("span");
        details.textContent = [track.artist, track.album].filter(Boolean).join(" · ");
        copy.append(title, details);
        const play = document.createElement("span");
        play.className = "search-result-play";
        play.innerHTML = icon("i-play");
        button.append(cover, copy, play);
        resultsList.appendChild(button);
      });
    }

    function createFolderEntry(folderName, items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-entry";
      button.dataset.folder = folderName;
      button.innerHTML = `${icon("i-folder")}<span class="folder-entry-name"></span><span class="folder-entry-count"></span>`;
      button.querySelector(".folder-entry-name").textContent = folderName;
      button.querySelector(".folder-entry-count").textContent = `${items.length} ${items.length === 1 ? "song" : "songs"}`;
      return button;
    }

    function createTrackRow(track, index) {
      const button = document.createElement("button");
      button.className = `track${index === activeTrack ? " current" : ""}`;
      button.dataset.track = String(index);
      button.type = "button";
      const cover = document.createElement("span");
      cover.className = `cover cover-${index % 11 + 1}`;
      cover.setAttribute("aria-hidden", "true");
      setArtwork(cover, track);
      if (track.localFile || index === 0) cover.innerHTML = icon("i-music");
      const copy = document.createElement("span");
      copy.className = "track-copy";
      const title = document.createElement("span");
      title.className = "track-title";
      title.textContent = track.title;
      const artist = document.createElement("span");
      artist.className = "track-artist";
      const metadataSummary = [track.artist, track.album, track.genre, track.folder]
        .filter(Boolean)
        .join(" · ");
      artist.textContent = metadataSummary;
      artist.title = metadataSummary;
      copy.append(title, artist);
      const heart = document.createElement("span");
      const isFavorite = favoriteTrackIds.has(track.id);
      heart.className = `track-heart${isFavorite ? " is-liked" : ""}`;
      heart.setAttribute("aria-hidden", "true");
      heart.innerHTML = icon(isFavorite ? "i-heart-fill" : "i-heart");
      const time = document.createElement("span");
      time.className = "track-time";
      time.textContent = track.time;
      button.append(cover, copy, heart, time);
      return button;
    }

    function* libraryListEntries(groups, query, foldersOnly, category) {
      if (!groups.size && category === "Liked Songs") {
        yield Object.assign(document.createElement("p"), {
          className: "library-empty",
          textContent: "Like a track to add it here."
        });
      }
      for (const [label, items] of groups) {
        if (foldersOnly) {
          if (!query || label.toLowerCase().includes(query)) yield createFolderEntry(label, items);
          continue;
        }

        yield Object.assign(document.createElement("h3"), {
          className: "library-group-heading",
          textContent: label
        });
        for (const { track, index } of items) {
          if (query && !getTrackSearchText(track).includes(query)) continue;
          yield createTrackRow(track, index);
        }
      }
    }

    function renderTrackList(preserveScroll = false) {
      const renderToken = ++libraryRenderToken;
      const query = document.getElementById("search").value.trim().toLowerCase();
      const previousScrollTop = preserveScroll ? list.scrollTop : 0;
      list.replaceChildren();
      list.scrollTop = previousScrollTop;
      list.setAttribute("aria-busy", "true");

      const foldersOnly = activeLibraryCategory === "Folders" && !activeFolderSelection;
      const trackIndices = activeLibraryCategory === "Folders" && activeFolderSelection
        ? playbackTrackIndices
        : null;
      const groups = groupTracksBy(activeLibraryCategory, trackIndices);
      const entries = libraryListEntries(groups, query, foldersOnly, activeLibraryCategory);
      const chunkSize = 12;

      function appendChunk() {
        if (renderToken !== libraryRenderToken) return;
        const fragment = document.createDocumentFragment();
        let count = 0;
        while (count < chunkSize) {
          const next = entries.next();
          if (next.done) break;
          fragment.appendChild(next.value);
          count += 1;
        }
        list.appendChild(fragment);
        if (preserveScroll) list.scrollTop = previousScrollTop;
        if (count === chunkSize) {
          requestAnimationFrame(appendChunk);
        } else {
          list.setAttribute("aria-busy", "false");
        }
      }

      requestAnimationFrame(appendChunk);
    }

    function scheduleLibraryRefresh(refreshTrackList = false, invalidateCaches = true) {
      libraryListRefreshRequested = libraryListRefreshRequested || refreshTrackList;
      libraryCacheInvalidationRequested = libraryCacheInvalidationRequested || invalidateCaches;
      if (libraryRefreshScheduled) return;
      libraryRefreshScheduled = true;
      requestAnimationFrame(() => {
        libraryRefreshScheduled = false;
        const shouldInvalidateCaches = libraryCacheInvalidationRequested;
        libraryCacheInvalidationRequested = false;
        if (shouldInvalidateCaches) invalidateLibraryCaches();
        const shouldRefreshTrackList = libraryListRefreshRequested;
        libraryListRefreshRequested = false;
        renderHomeSections();
        if (shouldRefreshTrackList && !document.getElementById("search").value.trim()) renderTrackList(true);
        renderSearchResults();
        renderQueue();
        renderPlaylistHeading(libraryFolderName);
      });
    }

    function renderQueue() {
      const queue = document.querySelector(".queue");
      queue.querySelectorAll(".queue-cover").forEach((button) => button.remove());
      const spacer = queue.querySelector(".queue-spacer");
      playbackTrackIndices.slice(0, 7).forEach((trackIndex, i) => {
        const track = tracks[trackIndex];
        const button = document.createElement("button");
        button.type = "button";
        button.className = `queue-cover queue-cover-${i % 7 + 1}${trackIndex === activeTrack ? " active" : ""}`;
        button.dataset.track = String(trackIndex);
        button.setAttribute("aria-label", `Play ${track.title}`);
        button.textContent = track.title;
        queue.insertBefore(button, spacer);
      });
    }

    function renderPlaylistHeading(folderName) {
      const isLocalLibrary = Boolean(folderName);
      libraryFolderName = folderName || "";
      document.getElementById("playlist-title").textContent = isLocalLibrary ? "Your Library" : "Daily Mix";
      document.querySelector(".playlist-subtitle").textContent = activeFolderSelection
        ? `Folder: ${activeFolderSelection}`
        : isLocalLibrary
          ? `Audio from ${folderName}`
          : "A little bit of everything, for you.";
      const visibleTrackCount = activeFolderSelection ? playbackTrackIndices.length : tracks.length;
      document.getElementById("playlist-count").textContent =
        `${visibleTrackCount} ${visibleTrackCount === 1 ? "track" : "tracks"} in this ${activeFolderSelection || (isLocalLibrary ? "folder" : "mix")}`;
    }

    function renderPlaylist(folderName) {
      renderLibraryCategories();
      renderHomeSections();
      if (!document.getElementById("search").value.trim()) renderTrackList();
      renderSearchResults();
      renderQueue();
      renderPlaylistHeading(folderName);
    }

    renderPlaylist();

    function formatTime(seconds) {
      if (!Number.isFinite(seconds)) return "--:--";
      const mins = Math.floor(seconds / 60);
      return `${String(mins).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    }

    function formatNowPlayingTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
      const mins = Math.floor(seconds / 60);
      return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    }

    function getAudioQualityLabel(track) {
      const fileSize = track.file instanceof Blob ? track.file.size : Number(track.fileSize) || 0;
      const fileType = track.file instanceof Blob ? track.file.type : "";
      const fileFormat = (track.format || fileType.split("/").pop() || "")
        .toLowerCase()
        .replace(/^x-/, "");
      if (fileFormat === "flac") return "ılı Audio • FLAC / Lossless >";

      const storedTime = typeof track.time === "string" ? track.time.match(/^(\d+):(\d{2})$/) : null;
      const storedDuration = storedTime ? Number(storedTime[1]) * 60 + Number(storedTime[2]) : 0;
      const trackDuration = tracks[activeTrack] === track && Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : storedDuration;
      if (!fileSize || !trackDuration) return "ılı Audio >";

      const approximateBitrate = fileSize * 8 / (trackDuration * 1000);
      const standardBitrates = [128, 192, 256, 320];
      const bitrate = standardBitrates.reduce((closest, candidate) =>
        Math.abs(candidate - approximateBitrate) < Math.abs(closest - approximateBitrate)
          ? candidate
          : closest
      );
      return `ılı Audio • ${bitrate} kbps >`;
    }

    function updateNowPlayingAudioQuality(track) {
      const currentTrack = track || tracks[activeTrack];
      if (currentTrack) {
        document.getElementById("now-playing-audio-quality").textContent = getAudioQualityLabel(currentTrack);
      }
    }

    function updateNowPlayingProgress() {
      const track = tracks[activeTrack];
      const trackTime = track && typeof track.time === "string" ? track.time.match(/^(\d+):(\d{2})$/) : null;
      const trackDuration = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : trackTime ? Number(trackTime[1]) * 60 + Number(trackTime[2]) : 0;
      const currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const progress = trackDuration > 0 ? Math.max(0, Math.min(100, currentTime / trackDuration * 100)) : 0;
      document.getElementById("now-playing-elapsed").textContent = formatNowPlayingTime(currentTime);
      document.getElementById("now-playing-remaining").textContent = `-${formatNowPlayingTime(Math.max(0, trackDuration - currentTime))}`;
      nowPlayingSeek.value = String(Math.round(progress * 10));
      nowPlayingSeek.style.setProperty("--progress", `${progress}%`);
    }

    function pictureDataUrl(picture) {
      if (!picture || !picture.data || !picture.data.length) return "";
      const format = /^image\/(jpeg|png|webp|gif)$/i.test(picture.format || "") ? picture.format : "image/jpeg";
      const bytes = Uint8Array.from(picture.data);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return `data:${format};base64,${btoa(binary)}`;
    }

    function parseLyrics(value) {
      const lyricValue = value && typeof value === "object"
        ? (value.syncLyrics || value.synchronizedLyrics || value.lyrics || value.text || value.data || value)
        : value;
      if (Array.isArray(lyricValue)) {
        const rows = lyricValue.map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const text = metadataText(entry.text || entry.lyric || entry.data);
          const stamp = Number(entry.timestamp ?? entry.timeStamp ?? entry.time);
          if (!text || !Number.isFinite(stamp)) return null;
          return { time: stamp > 10000 ? stamp / 1000 : stamp, text };
        }).filter(Boolean).sort((a, b) => a.time - b.time);
        if (rows.length) return rows;
      }

      const text = metadataText(lyricValue);
      if (!text) return [];
      const rows = [];
      const timestampPattern = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
      text.split(/\r?\n/).forEach((line) => {
        const lyricText = line.replace(timestampPattern, "").trim();
        if (!lyricText) return;
        const timestamps = Array.from(line.matchAll(timestampPattern));
        if (!timestamps.length) {
          rows.push({ time: null, text: lyricText });
          return;
        }
        timestamps.forEach((match) => {
          const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
          rows.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text: lyricText });
        });
      });
      return rows.sort((a, b) => (a.time ?? -1) - (b.time ?? -1));
    }

    function updateNowPlaying() {
      const track = tracks[activeTrack];
      if (!track) return;
      updateMediaSessionMetadata();
      document.getElementById("now-playing-title").textContent = track.title;
      document.getElementById("now-playing-artist").textContent = track.artist;
      updateNowPlayingAudioQuality(track);
      const sourceName = activeNavigationView === "library"
        ? activeFolderSelection
          ? track.folder || libraryFolderName || "Your Library"
          : activeLibraryCategory === "Songs" ? "All Songs" : activeLibraryCategory
        : activeNavigationView === "playlists" ? libraryFolderName || "Daily Mix" : "All Songs";
      document.getElementById("now-playing-source").textContent = sourceName;
      const art = document.getElementById("now-playing-art");
      setArtwork(art, track);
      updateDynamicArtworkAccent(track);
      if (track.artwork) {
        art.setAttribute("aria-label", `${track.title} album artwork`);
        nowPlayingOverlay.style.setProperty("--current-artwork", `url("${track.artwork}")`);
      } else {
        art.setAttribute("aria-label", `${track.title} — no album artwork`);
        nowPlayingOverlay.style.removeProperty("--current-artwork");
      }

      if (currentLyricsTrackId !== track.id) {
        currentLyricsTrackId = track.id;
        activeLyricIndex = -1;
        currentLyrics = Array.isArray(track.lyrics) ? track.lyrics : [];
        const lyricsContainer = document.getElementById("lyrics-lines");
        lyricsContainer.replaceChildren();
        if (!currentLyrics.length) {
          const empty = document.createElement("p");
          empty.className = "lyrics-empty";
          empty.textContent = "No embedded lyrics found for this track.";
          lyricsContainer.appendChild(empty);
        } else {
          currentLyrics.forEach((line, index) => {
            const lyric = document.createElement("p");
            lyric.className = "lyric-line";
            lyric.dataset.lyricIndex = String(index);
            lyric.textContent = line.text;
            lyricsContainer.appendChild(lyric);
          });
        }
        const hasTimestamps = currentLyrics.some((line) => Number.isFinite(line.time));
        document.getElementById("lyrics-sync-status").textContent = hasTimestamps ? "SYNCED" : "UNSYNCED";
      }
      updateNowPlayingProgress();
      updateSyncedLyrics();
    }

    function updateSyncedLyrics() {
      if (!currentLyrics.length) return;
      if (!settingsState.highlightLyrics) {
        document.querySelectorAll(".lyric-line.active").forEach((line) => line.classList.remove("active"));
        activeLyricIndex = -1;
        return;
      }
      let activeLine = -1;
      for (let i = 0; i < currentLyrics.length; i++) {
        if (Number.isFinite(currentLyrics[i].time) && currentLyrics[i].time <= audio.currentTime) activeLine = i;
      }
      document.querySelectorAll(".lyric-line").forEach((line, index) => {
        const active = index === activeLine;
        line.classList.toggle("active", active);
        if (active && activeLine !== activeLyricIndex && nowPlayingOverlay.classList.contains("open")) {
          line.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
      activeLyricIndex = activeLine;
    }

    function openNowPlaying() {
      if (settingsView && !settingsView.hidden) closeSettingsView();
      clearTimeout(nowPlayingCloseTimer);
      nowPlayingOverlay.hidden = false;
      nowPlayingOverlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("now-playing-open");
      updateNowPlaying();
      requestAnimationFrame(() => nowPlayingOverlay.classList.add("open"));
    }

    function closeNowPlaying() {
      nowPlayingOverlay.classList.remove("open");
      nowPlayingOverlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("now-playing-open");
      clearTimeout(nowPlayingCloseTimer);
      nowPlayingCloseTimer = setTimeout(() => {
        if (!nowPlayingOverlay.classList.contains("open")) nowPlayingOverlay.hidden = true;
      }, 340);
    }

    function persistSettings() {
      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(settingsState));
      } catch (error) {
        console.error("Settings could not be saved:", error);
        showToast("Unable to save settings in browser storage.");
      }
    }

    function persistEqSettings() {
      clearTimeout(eqSaveTimer);
      settingsState.equalizerEnabled = eqEnabled;
      settingsState.clarityEnabled = clarityEnabled;
      settingsState.audioProfile = activeClarityProfile;
      settingsState.eqValues = [...eqValues];
      settingsState.eqActivePreset = eqActivePreset;
      settingsState.eqPresetPill = eqPresetPill;
      settingsState.eqResetValues = [...eqResetValues];
      settingsState.eqResetPreset = eqResetPreset;
      settingsState.eqResetPill = eqResetPill;
      persistSettings();
    }

    function scheduleEqSettingsSave() {
      clearTimeout(eqSaveTimer);
      eqSaveTimer = setTimeout(persistEqSettings, 180);
    }

    function logDiagnostic(message, details) {
      const entry = { time: new Date().toISOString(), message };
      if (details) entry.details = details;
      diagnosticLogs.push(entry);
      if (diagnosticLogs.length > 200) diagnosticLogs.shift();
      if (settingsState.verboseLogging) console.info("[MusicHeaven]", message, details || "");
    }

    function downloadJson(filename, data) {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function localStorageUsage() {
      let bytes = 0;
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key && key.startsWith("musicHeaven.")) {
          bytes += (key.length + localStorage.getItem(key).length) * 2;
        }
      }
      return bytes;
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    function toggleControl(key, label, note) {
      return `<label class="setting-control"><span>${label}</span><input type="checkbox" role="switch" data-setting="${key}" ${settingsState[key] ? "checked" : ""}><i aria-hidden="true"></i>${note ? `<small>${note}</small>` : ""}</label>`;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]);
    }

    function settingCard(category, title, description, control) {
      return { category, title, description, control };
    }

    function choiceButtons(key, choices, selected) {
      return `<div class="setting-choices" role="group">${choices.map((choice) =>
        `<button type="button" class="setting-choice${selected === choice ? " selected" : ""}" data-choice-key="${key}" data-choice-value="${choice}" aria-pressed="${selected === choice}">${choice}</button>`
      ).join("")}</div>`;
    }

    function settingsCatalog() {
      const storageUse = formatBytes(localStorageUsage());
      return [
        settingCard("General", "Behaviour", "Choose how MusicHeaven behaves when you switch tabs. Browsers do not provide a system tray.", toggleControl("backgroundPlayback", "Continue playback in background", "If disabled, playback pauses when this tab is hidden.")),
        settingCard("General", "Backup", "Export playlists and app settings as JSON. Audio files stay in this browser's IndexedDB and are not included.", '<div class="setting-actions"><button type="button" class="setting-button primary" data-action="export-backup">Export backup</button><button type="button" class="setting-button" data-action="import-backup">Import backup</button></div>'),
        settingCard("General", "Cached data", `LocalStorage: ${storageUse}. Audio files are stored separately in IndexedDB.`, `<div class="setting-actions"><span class="storage-stat" id="storage-stat">${storageUse} local data · calculating IndexedDB…</span><button type="button" class="setting-button danger" data-action="clear-cache">Clear cached data</button></div>`),
        settingCard("General", "Diagnostics", "Verbose logging adds app events to the local diagnostic export.", `${toggleControl("verboseLogging", "Verbose logging")}<div class="setting-actions"><button type="button" class="setting-button" data-action="export-diagnostics">Export diagnostic logs</button></div>`),

        settingCard("Playback", "Playback behaviour", "Control what happens when a track finishes or the tab is backgrounded.", `${toggleControl("autoplayNext", "Automatically play next track")}${toggleControl("backgroundPlayback", "Continue playback in background")}`),
        settingCard("Playback", "Volume", "Set the player volume and optionally remember it on this device.", `${toggleControl("rememberVolume", "Remember volume") }<label class="setting-range"><span>Default volume</span><input type="range" min="0" max="1" step=".01" value="${settingsState.defaultVolume}" data-setting="defaultVolume"></label>`),
        ...(isAndroidPlatform ? [settingCard("Audio", "Android audio path", "Direct playback avoids Web Audio processing and its extra resampling. Android and device hardware may still resample; EQ, Sound FX, and Timed mix require processed playback.", toggleControl("androidDirectPlayback", "High-quality direct playback"))] : []),
        settingCard("Audio", "AutoMix", "A short fade at track boundaries avoids abrupt transitions. True gapless playback depends on the selected audio files and browser.", `${toggleControl("timedMix", "Timed mix")}`),
        settingCard("Audio", "Equalizer & Sound FX", "10-band Web Audio equalizer with live frequency-response curve and sound-processing controls.", `<div id="eq-card-host"></div><span class="setting-search-terms">${eqPresetNames.join(" ")} 31 Hz 63 Hz 125 Hz 250 Hz 500 Hz 1 kHz 2 kHz 4 kHz 8 kHz 16 kHz Flat (0 dB) +2 dB Bass +2 dB Treble Double-click band to zero Master on off</span>`),
        settingCard("Downloads", "Offline", "Download lyrics sidecars and choose how MusicHeaven organizes files saved through supported browser features.", `${toggleControl("downloadLyrics", "Download lyrics", "Save synced lyrics as .lrc when available.")}<div class="setting-location"><span><strong>Save location</strong><small id="download-location-label">${settingsState.downloadLocation}</small></span><button type="button" class="setting-button" data-action="choose-download-location">Change</button></div><label class="setting-select"><span>Folder layout</span><select data-setting="folderLayout"><option${settingsState.folderLayout === "Flat" ? " selected" : ""}>Flat</option><option${settingsState.folderLayout === "Artist" ? " selected" : ""}>Artist</option><option${settingsState.folderLayout === "Album" ? " selected" : ""}>Album</option></select></label><button type="button" class="setting-button" data-action="reorganize-downloads">Reorganize existing downloads</button>`),
        settingCard("Library", "Library display", "Adjust how imported songs and metadata are shown.", `${toggleControl("compactLibrary", "Compact song list")}${toggleControl("showMetadata", "Show artist and album details")}`),
        settingCard("Library", "Library sources", "Show podcast results and sync imported music to a private YouTube playlist.", `${toggleControl("podcasts", "Podcasts")}${toggleControl("youtubeMusicSync", "YouTube Music sync")}<div class="setting-actions"><button type="button" class="setting-button" data-action="youtube-sync"${youtubeSyncInProgress ? " disabled" : ""}>${youtubeSyncInProgress ? "Syncing…" : "Sync now"}</button></div><p class="setting-note">This syncs local tracks to your private playlist. YouTube does not provide an official listening-history sync API.</p><h4 class="setting-subheading">Hidden from recommendations</h4><div class="setting-list" id="hidden-track-list"></div>`),
        settingCard("Lyrics", "Lyrics display", "Highlight the currently active line when embedded timestamps are available.", toggleControl("highlightLyrics", "Highlight synced lyrics")),
        settingCard("Appearance", "Theme", "Choose a built-in theme or customize your own accent.", `${choiceButtons("theme", ["Midnight", "Pearl", "Custom"], settingsState.theme)}<div class="accent-options">${[["#f2f2f2", "Pearl"], ["#3ea6ff", "Blue"], ["#ef4444", "Red"], ["#8b5cf6", "Violet"], ["#20a6c7", "Cyan"], ["#52a35f", "Green"], ["#e6a62e", "Amber"], ["#e34d78", "Pink"]].map(([color, name]) => `<button type="button" class="accent-option${settingsState.accentColor === color ? " selected" : ""}" data-accent="${color}" style="--option-color:${color}" aria-label="${name}" aria-pressed="${settingsState.accentColor === color}"></button>`).join("")}<label class="custom-color"><span>Custom colour</span><input type="color" value="${settingsState.customAccentColor}" data-custom-accent aria-label="Custom accent colour"></label></div>`),
        settingCard("Appearance", "Haze material", "Set surface material and intensity.", `<label class="setting-select"><span>Material</span><select data-setting="hazeMaterial"><option${settingsState.hazeMaterial === "Automatic" ? " selected" : ""}>Automatic</option><option${settingsState.hazeMaterial === "Solid" ? " selected" : ""}>Solid</option></select></label><label class="setting-range"><span>Intensity</span></label>${choiceButtons("hazeIntensity", ["Low", "Medium", "High"], settingsState.hazeIntensity)}`),
        settingCard("Appearance", "Now Playing ambient", "Choose the background style behind artwork and lyrics.", choiceButtons("nowPlayingAmbient", ["Apple Music", "WinUI"], settingsState.nowPlayingAmbient)),
        settingCard("Appearance", "Surfaces", "Adjust contrast and artwork tinting.", `${toggleControl("amoledBlack", "AMOLED black")}${toggleControl("dynamicArtworkTheme", "Dynamic artwork theme")}`),
        settingCard("Last.fm", "Last.fm connection", `Status: ${settingsState.lastFmUsername ? `Connected as ${settingsState.lastFmUsername}` : "Not connected"}.`, `<label class="setting-text-input"><span>Backend API URL</span><input type="url" autocomplete="url" data-backend-url value="${escapeHtml(settingsState.integrationsBackendUrl)}" placeholder="Blank uses this site’s server"></label><label class="setting-text-input"><span>Last.fm API key</span><input type="text" autocomplete="off" data-lastfm-key value="${escapeHtml(settingsState.lastFmApiKey)}" placeholder="Enter API key"></label><div class="setting-status" id="lastfm-backend-status">${lastFmBackendStatus.available ? (lastFmBackendStatus.lastFmSecretConfigured ? "Backend ready; shared secret configured on server." : "Backend online; set LASTFM_SHARED_SECRET on the server.") : "Backend status not checked."}</div><div class="setting-actions"><button type="button" class="setting-button" data-action="lastfm-save">Save &amp; validate</button><button type="button" class="setting-button primary" data-action="lastfm-connect">${lastFmAuthToken ? "I've authorized — verify" : "Connect Last.fm"}</button><button type="button" class="setting-button" data-action="lastfm-signout">Sign out</button><button type="button" class="setting-button" data-action="lastfm-clear">Clear API key</button></div><p class="setting-note">The shared secret is kept only in the backend environment (.env: LASTFM_SHARED_SECRET); it is never stored in this browser. Create an API app at <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">last.fm/api/account/create</a>. After authorizing in a new tab, return here and verify.</p>`),
        settingCard("Last.fm", "Last.fm scrobbling", "When connected, now-playing updates and scrobbles are sent through the configured backend.", `${toggleControl("lastFmScrobbling", "Enable scrobbling")}${toggleControl("lastFmNowPlaying", "Now playing updates")}<label class="setting-range"><span>Scrobble at ${settingsState.lastFmThreshold}% of track</span><input type="range" min="25" max="90" step="1" value="${settingsState.lastFmThreshold}" data-setting="lastFmThreshold"></label>`),
        settingCard("Integrations", "YouTube Music", "Connect with Google OAuth to sync imported tracks into a private YouTube playlist. Listening history is not available through the official API.", `<label class="setting-text-input"><span>Google OAuth Client ID</span><input type="text" autocomplete="off" data-youtube-client-id value="${escapeHtml(settingsState.youtubeOAuthClientId)}" placeholder="...apps.googleusercontent.com"></label><div class="setting-actions"><span class="storage-stat" id="youtube-status">${youtubeAccessToken ? "Connected for this session" : "Not connected"}</span><button type="button" class="setting-button" data-action="youtube-connect">${youtubeAccessToken ? "Disconnect" : "Add"}</button></div><p class="setting-note">Enable YouTube Data API v3 and allow your app origin in the Google OAuth client settings. The client ID is public; no client secret belongs in this app.</p>`),
        settingCard("Integrations", "Spotify", "Spotify cookie login and Canvas need a trusted service integration; credentials are not collected by this local app.", `<div class="setting-actions"><button type="button" class="setting-button" data-action="spotify-login">Login with cookies</button></div>${toggleControl("spotifyCanvas", "Spotify Canvas")}`),
        settingCard("Integrations", "Discord", "Rich presence is available only through a desktop bridge; browser-only mode cannot publish it.", toggleControl("discordRichPresence", "Discord Rich Presence")),
        settingCard("Sources", "Addon sources", "Add-on URLs are stored on this device. Source execution is not supported by this local player.", '<div class="setting-list" id="addon-source-list"></div><button type="button" class="setting-button primary" data-action="add-addon">Add addon</button>'),
        settingCard("Experimental", "Experimental features", "No experimental playback features are enabled.", '<p class="setting-note">Core library and playback features remain available.</p>'),
        settingCard("About", "About MusicHeaven", "Build and project links", `<div class="about-version"><strong>MusicHeaven · v${CURRENT_APP_VERSION}</strong><button type="button" class="setting-button" data-action="check-updates">↻ Check for updates</button></div><div class="about-links"><a class="setting-button" href="https://github.com/shimulsarker/MusicHeaven" target="_blank" rel="noopener noreferrer">↗ GitHub repository</a><a class="setting-button" href="https://github.com/shimulsarker/MusicHeaven/issues" target="_blank" rel="noopener noreferrer">ⓘ Report an issue</a><a class="setting-button" href="https://github.com/shimulsarker/MusicHeaven/releases" target="_blank" rel="noopener noreferrer">★ Releases</a></div><p class="setting-note" id="update-check-status" aria-live="polite">A local music player for your personal library.</p>`)
      ];
    }

    function renderSettingsView() {
      const query = document.getElementById("settings-search").value.trim().toLowerCase();
      document.querySelectorAll(".settings-category").forEach((button) => {
        button.classList.toggle("active", button.dataset.settingsCategory === activeSettingsCategory && !query);
      });
      const eqCard = document.getElementById("eq-card");
      if (eqCard && eqCard.parentElement !== eqCardHolder) eqCardHolder.appendChild(eqCard);
      const catalog = settingsCatalog();
      const items = query
        ? catalog.filter((card) => `${card.category} ${card.title} ${card.description} ${card.control} ${card.control.replace(/<[^>]*>/g, " ")}`.toLowerCase().includes(query))
        : catalog.filter((card) => card.category === activeSettingsCategory);
      const content = document.getElementById("settings-content");
      content.replaceChildren();
      const heading = document.createElement("div");
      heading.className = "settings-heading";
      const eyebrow = document.createElement("p");
      eyebrow.className = "section-kicker";
      eyebrow.textContent = query ? "SEARCH RESULTS" : "PREFERENCES";
      const title = document.createElement("h2");
      title.textContent = query ? `Settings matching “${document.getElementById("settings-search").value.trim()}”` : activeSettingsCategory;
      heading.append(eyebrow, title);
      content.appendChild(heading);
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "setting-note";
        empty.textContent = "No settings match your search.";
        content.appendChild(empty);
        return;
      }
      items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "setting-card";
        if ((item.category === "Audio" && item.title === "Equalizer & Sound FX") || item.category === "About") {
          card.classList.add("setting-card-full");
        }
        const copy = document.createElement("div");
        copy.className = "setting-card-copy";
        if (query) {
          const category = document.createElement("p");
          category.className = "setting-category-label";
          category.textContent = item.category;
          copy.appendChild(category);
        }
        const cardTitle = document.createElement("h3");
        cardTitle.textContent = item.title;
        const description = document.createElement("p");
        description.textContent = item.description;
        copy.append(cardTitle, description);
        const controls = document.createElement("div");
        controls.className = "setting-card-controls";
        controls.innerHTML = item.control;
        card.append(copy, controls);
        content.appendChild(card);
      });
      const eqHost = content.querySelector("#eq-card-host");
      if (eqHost && eqCard) eqHost.appendChild(eqCard);
      if (content.querySelector("#storage-stat")) {
        void updateStorageEstimate();
      }
      if (content.querySelector("#hidden-track-list")) {
        renderHiddenTrackManager(content.querySelector("#hidden-track-list"));
      }
      if (content.querySelector("#lastfm-backend-status") && !lastFmBackendStatus.checked) {
        void refreshLastFmBackendStatus();
      }
      if (content.querySelector("[data-youtube-client-id]") && !youtubeAccessToken &&
        !youtubeOAuthReady && !youtubeOAuthLoading) {
        const connectButton = content.querySelector('[data-action="youtube-connect"]');
        youtubeOAuthLoading = true;
        if (connectButton) {
          connectButton.disabled = true;
          connectButton.textContent = "Loading sign-in…";
        }
        void loadGoogleIdentityServices().then(() => {
          youtubeOAuthReady = true;
          youtubeOAuthLoading = false;
          if (connectButton && connectButton.isConnected) {
            connectButton.disabled = false;
            connectButton.textContent = "Add";
          }
        }).catch((error) => {
          youtubeOAuthLoading = false;
          console.warn("Google sign-in could not be preloaded:", error);
          if (connectButton && connectButton.isConnected) {
            connectButton.disabled = false;
            connectButton.textContent = "Add";
          }
        });
      }
      if (content.querySelector("#addon-source-list")) {
        renderAddonSources(content.querySelector("#addon-source-list"));
      }
    }

    async function updateStorageEstimate() {
      const stat = document.getElementById("storage-stat");
      if (!stat) return;
      try {
        const database = await openPlaylistDatabase();
        const bytes = await new Promise((resolve, reject) => {
          const transaction = database.transaction("audio", "readonly");
          const request = transaction.objectStore("audio").openCursor();
          let total = 0;
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return resolve(total);
            const record = cursor.value;
            if (record && record.blob instanceof Blob) total += record.blob.size;
            cursor.continue();
          };
          request.onerror = () => reject(request.error || new Error("Unable to measure cached audio."));
        });
        stat.textContent = `${formatBytes(localStorageUsage())} local · ${formatBytes(bytes)} IndexedDB`;
      } catch (error) {
        console.error("Cached data size could not be measured:", error);
        stat.textContent = `${formatBytes(localStorageUsage())} local · IndexedDB size unavailable`;
      }
    }

    function renderHiddenTrackManager(container) {
      if (!container) return;
      container.replaceChildren();
      const availableTracks = tracks.filter((track) => !settingsState.hiddenTrackIds.includes(track.id));
      if (availableTracks.length) {
        const select = document.createElement("select");
        select.className = "setting-list-select";
        select.setAttribute("aria-label", "Choose a track to hide from recommendations");
        availableTracks.forEach((track) => {
          const option = document.createElement("option");
          option.value = track.id;
          option.textContent = `${track.title} — ${track.artist}`;
          select.appendChild(option);
        });
        const hideButton = document.createElement("button");
        hideButton.type = "button";
        hideButton.className = "setting-button";
        hideButton.dataset.action = "hide-track";
        hideButton.textContent = "Hide track";
        container.append(select, hideButton);
      }
      const hidden = settingsState.hiddenTrackIds.map((id) => tracks.find((track) => track.id === id)).filter(Boolean);
      if (!hidden.length) {
        const empty = document.createElement("p");
        empty.className = "setting-note";
        empty.textContent = "No tracks are hidden.";
        container.appendChild(empty);
      }
      hidden.forEach((track) => {
        const row = document.createElement("div");
        row.className = "setting-list-row";
        const title = document.createElement("span");
        title.textContent = `${track.title} — ${track.artist}`;
        const restore = document.createElement("button");
        restore.type = "button";
        restore.className = "setting-button";
        restore.dataset.action = "restore-track";
        restore.dataset.trackId = track.id;
        restore.textContent = "Restore";
        row.append(title, restore);
        container.appendChild(row);
      });
    }

    function renderAddonSources(container) {
      if (!container) return;
      container.replaceChildren();
      if (!settingsState.addonSources.length) {
        const empty = document.createElement("p");
        empty.className = "setting-note";
        empty.textContent = "No add-on sources have been added.";
        container.appendChild(empty);
      }
      settingsState.addonSources.forEach((url, index) => {
        const row = document.createElement("div");
        row.className = "setting-list-row";
        const label = document.createElement("span");
        label.textContent = url;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "setting-button";
        remove.dataset.action = "remove-addon";
        remove.dataset.addonIndex = String(index);
        remove.textContent = "Remove";
        row.append(label, remove);
        container.appendChild(row);
      });
    }

    function openSettingsView() {
      closeNowPlaying();
      activeSettingsCategory = "General";
      document.getElementById("settings-search").value = "";
      settingsView.hidden = false;
      settingsView.classList.add("open");
      renderSettingsView();
      document.body.classList.add("settings-open");
    }

    function closeSettingsView() {
      settingsView.hidden = true;
      settingsView.classList.remove("open");
      document.body.classList.remove("settings-open");
    }

    function enableAndroidAudioProcessing() {
      if (!isAndroidPlatform || !settingsState.androidDirectPlayback) return;
      settingsState.androidDirectPlayback = false;
      const directPlaybackToggle = document.querySelector('[data-setting="androidDirectPlayback"]');
      if (directPlaybackToggle) directPlaybackToggle.checked = false;
      connectAudio();
      if (audioContext && audioContext.state === "suspended") {
        void audioContext.resume().catch((error) => {
          console.error("Audio processing could not be resumed:", error);
          showToast("Audio effects could not be started.");
        });
      }
      showToast("Audio effects enabled. Android may resample processed playback.");
    }

    function updateSetting(key, value) {
      settingsState[key] = value;
      if (isAndroidPlatform && value && ["equalizerEnabled", "clarityEnabled", "timedMix"].includes(key)) {
        enableAndroidAudioProcessing();
      }
      if (key === "androidDirectPlayback" && isAndroidPlatform) {
        if (value && audioSource) {
          showToast("Direct playback will take effect after restarting MusicHeaven.");
        } else if (!value) {
          connectAudio();
          if (audioContext && audioContext.state === "suspended") {
            void audioContext.resume().catch((error) => {
              console.error("Audio processing could not be resumed:", error);
              showToast("Audio effects could not be started.");
            });
          }
        } else {
          settingsState.equalizerEnabled = false;
          settingsState.clarityEnabled = false;
          settingsState.timedMix = false;
          setEqEnabled(false);
          setClarityEnabled(false);
          const timedMixToggle = document.querySelector('[data-setting="timedMix"]');
          if (timedMixToggle) timedMixToggle.checked = false;
        }
      }
      if (key === "backgroundPlayback" && value && !audio.paused && document.hidden) {
        showToast("Playback will continue while this tab is in the background.");
      }
      if (key === "equalizerEnabled") setEqEnabled(value);
      if (key === "clarityEnabled") setClarityEnabled(value);
      if (key === "compactLibrary") document.body.classList.toggle("compact-library", value);
      if (key === "showMetadata") document.body.classList.toggle("hide-library-metadata", !value);
      if (key === "highlightLyrics") updateSyncedLyrics();
      if (key === "accentColor") document.documentElement.style.setProperty("--accent", value);
      if (key === "accentColor") {
        document.querySelectorAll(".accent-option").forEach((option) => {
          const selected = option.dataset.accent === value;
          option.classList.toggle("selected", selected);
          option.setAttribute("aria-pressed", String(selected));
        });
      }
      if (key === "theme" || key === "amoledBlack" || key === "hazeMaterial" || key === "hazeIntensity" || key === "nowPlayingAmbient") {
        applyAppearanceSettings();
      }
      if (key === "dynamicArtworkTheme") {
        applyAppearanceSettings();
        if (value) updateDynamicArtworkAccent(tracks[activeTrack]);
      }
      if (key === "lastFmThreshold") {
        const label = document.querySelector('.setting-range input[data-setting="lastFmThreshold"]');
        if (label) label.parentElement.querySelector("span").textContent = `Scrobble at ${value}% of track`;
      }
      if (key === "downloadLocation") {
        const label = document.getElementById("download-location-label");
        if (label) label.textContent = value;
      }
      if (key === "lastFmScrobbling" && value && (!settingsState.lastFmApiKey || !settingsState.lastFmSessionKey)) {
        settingsState.lastFmScrobbling = false;
        const toggle = document.querySelector('[data-setting="lastFmScrobbling"]');
        if (toggle) toggle.checked = false;
        showToast("Connect your Last.fm account before enabling scrobbling.");
      }
      if (key === "lastFmScrobbling" && !settingsState.lastFmScrobbling) {
        lastFmNowPlayingTrackId = "";
      }
      if (key === "lastFmNowPlaying" && !value) lastFmNowPlayingTrackId = "";
      if ((key === "lastFmScrobbling" || key === "lastFmNowPlaying") &&
        settingsState.lastFmScrobbling && settingsState.lastFmNowPlaying && !audio.paused) {
        void updateLastFmNowPlaying();
      }
      if (key === "defaultVolume") {
        document.getElementById("volume").value = String(value);
        audio.volume = value;
      }
      if (key === "timedMix" && outputGain) {
        const now = audioContext.currentTime;
        outputGain.gain.cancelScheduledValues(now);
        outputGain.gain.setTargetAtTime(value ? outputGain.gain.value : 1, now, .04);
        if (!value) mixFadeScheduledForTrack = null;
      }
      persistSettings();
    }

    function applyAppearanceSettings() {
      document.body.classList.toggle("theme-pearl", settingsState.theme === "Pearl");
      document.body.classList.toggle("theme-custom", settingsState.theme === "Custom");
      document.body.classList.toggle("amoled-black", settingsState.amoledBlack);
      document.body.classList.toggle("haze-solid", settingsState.hazeMaterial === "Solid");
      document.body.dataset.hazeIntensity = settingsState.hazeIntensity.toLowerCase();
      nowPlayingOverlay.classList.toggle("winui-ambient", settingsState.nowPlayingAmbient === "WinUI");
      document.documentElement.style.setProperty("--accent", settingsState.accentColor);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", settingsState.theme === "Pearl" ? "#f5f5f5" : settingsState.amoledBlack ? "#000000" : "#121212");
    }

    async function clearCachedData() {
      if (!window.confirm("Clear MusicHeaven's playlist metadata, settings, and locally saved audio copies? This cannot be undone.")) return;
      try {
        const database = await openPlaylistDatabase();
        await new Promise((resolve, reject) => {
          const transaction = database.transaction("audio", "readwrite");
          transaction.objectStore("audio").clear();
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error("Unable to clear saved audio."));
          transaction.onabort = () => reject(transaction.error || new Error("Clearing saved audio was interrupted."));
        });
        for (let index = localStorage.length - 1; index >= 0; index--) {
          const key = localStorage.key(index);
          if (key && key.startsWith("musicHeaven.")) localStorage.removeItem(key);
        }
        database.close();
        location.reload();
      } catch (error) {
        console.error("Cached data could not be cleared:", error);
        showToast("Unable to clear all MusicHeaven data.");
      }
    }

    async function reorganizeDownloads() {
      if (!downloadDirectoryHandle) {
        showToast("Choose a save location before reorganizing files.");
        return;
      }
      if (typeof downloadDirectoryHandle.createWritable !== "function") {
        showToast("Writing to the selected folder is not supported by this browser.");
        return;
      }
      try {
        const database = await openPlaylistDatabase();
        const records = await new Promise((resolve, reject) => {
          const request = database.transaction("audio", "readonly").objectStore("audio").getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error || new Error("Unable to read saved audio."));
        });
        if (!records.length) {
          showToast("There are no locally saved audio files to reorganize.");
          return;
        }
        if (!window.confirm(`Write ${records.length} saved audio ${records.length === 1 ? "file" : "files"} to the selected folder?`)) return;
        let written = 0;
        for (const record of records) {
          const track = tracks.find((item) => item.id === record.id);
          if (!track || !(record.blob instanceof Blob)) continue;
          let folder = downloadDirectoryHandle;
          const parts = settingsState.folderLayout === "Artist" ? [track.artist]
            : settingsState.folderLayout === "Album" ? [track.artist, track.album] : [];
          for (const part of parts) {
            const safePart = String(part || "Unknown").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Unknown";
            folder = await folder.getDirectoryHandle(safePart, { create: true });
          }
          const extension = String(track.format || record.blob.type.split("/").pop() || "audio").replace(/[^a-z0-9]/gi, "").toLowerCase();
          const filename = `${String(track.title || "Track").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "Track"}.${extension}`;
          const fileHandle = await folder.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(record.blob);
          await writable.close();
          if (settingsState.downloadLyrics && Array.isArray(track.lyrics)) {
            const syncedLines = track.lyrics.filter((line) => Number.isFinite(line.time));
            if (syncedLines.length) {
              const lrc = syncedLines.map((line) => {
                const minutes = Math.floor(line.time / 60);
                const seconds = line.time - minutes * 60;
                const wholeSeconds = Math.floor(seconds);
                const centiseconds = Math.floor((seconds - wholeSeconds) * 100);
                return `[${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}]${line.text}`;
              }).join("\n");
              const lyricHandle = await folder.getFileHandle(`${filename.replace(/\.[^.]+$/, "")}.lrc`, { create: true });
              const lyricWriter = await lyricHandle.createWritable();
              await lyricWriter.write(lrc);
              await lyricWriter.close();
            }
          }
          written += 1;
        }
        showToast(`${written} saved ${written === 1 ? "file" : "files"} reorganized.`);
      } catch (error) {
        console.error("Saved audio could not be reorganized:", error);
        showToast("Unable to reorganize saved audio in the selected folder.");
      }
    }

    function backendBaseUrl() {
      const configuredUrl = settingsState.integrationsBackendUrl.trim();
      const candidate = configuredUrl || (/^https?:$/.test(window.location.protocol) ? window.location.origin : "");
      if (!candidate) throw new Error("Run the MusicHeaven Node server or enter its HTTPS URL in Backend API URL.");
      let parsed;
      try {
        parsed = new URL(candidate);
      } catch {
        throw new Error("Enter a valid backend URL.");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Backend URL must use HTTPS (HTTP is allowed for local development).");
      }
      if (parsed.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
        throw new Error("Use HTTPS for remote backend URLs so account session keys are not sent in clear text.");
      }
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
        throw new Error("Enter the backend origin only, without a path, query, or fragment.");
      }
      return parsed.origin;
    }

    async function backendRequest(path, body) {
      const response = await fetch(`${backendBaseUrl()}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(`Backend returned an unreadable response (HTTP ${response.status}).`);
      }
      if (!response.ok) throw new Error(result.error || `Backend returned HTTP ${response.status}.`);
      return result;
    }

    async function refreshLastFmBackendStatus() {
      const status = document.getElementById("lastfm-backend-status");
      try {
        lastFmBackendStatus = { available: true, ...(await backendRequest("/api/config")) };
        lastFmBackendStatus.checked = true;
        if (status) {
          status.textContent = lastFmBackendStatus.lastFmSecretConfigured
            ? "Backend ready; shared secret configured on server."
            : "Backend online; set LASTFM_SHARED_SECRET on the server before connecting.";
        }
      } catch (error) {
        lastFmBackendStatus = { available: false, checked: true, lastFmSecretConfigured: false };
        if (status) status.textContent = error.message || "Backend is not reachable.";
      }
    }

    async function saveLastFmCredentials() {
      const keyInput = document.querySelector("[data-lastfm-key]");
      const backendInput = document.querySelector("[data-backend-url]");
      const apiKey = keyInput ? keyInput.value.trim() : settingsState.lastFmApiKey;
      if (backendInput) settingsState.integrationsBackendUrl = backendInput.value.trim().replace(/\/+$/, "");
      if (!apiKey) {
        showToast("Enter your Last.fm API key.");
        return;
      }
      try {
        await backendRequest("/api/lastfm/validate", { apiKey });
        settingsState.lastFmApiKey = apiKey;
        persistSettings();
        await refreshLastFmBackendStatus();
        showToast("Last.fm API key validated. Connect your account to enable scrobbling.");
      } catch (error) {
        console.error("Last.fm API key validation failed:", error);
        showToast(error.message || "Unable to validate Last.fm API key.");
      }
    }

    async function connectLastFm() {
      const apiKeyInput = document.querySelector("[data-lastfm-key]");
      const backendInput = document.querySelector("[data-backend-url]");
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : settingsState.lastFmApiKey;
      if (backendInput) settingsState.integrationsBackendUrl = backendInput.value.trim().replace(/\/+$/, "");
      if (!apiKey) {
        showToast("Enter and validate your Last.fm API key first.");
        return;
      }
      const popup = window.open("about:blank", "musicheaven-lastfm-auth", "popup,width=560,height=760");
      if (!popup) {
        showToast("Allow popups for MusicHeaven to authorize Last.fm.");
        return;
      }
      try {
        const result = await backendRequest("/api/lastfm/auth-token", { apiKey });
        lastFmAuthToken = result.token;
        settingsState.lastFmApiKey = apiKey;
        persistSettings();
        popup.location.assign(result.authorizationUrl);
        renderSettingsView();
        showToast("Authorize MusicHeaven in the Last.fm tab, then return and verify.");
      } catch (error) {
        popup.close();
        console.error("Last.fm authorization could not start:", error);
        showToast(error.message || "Unable to start Last.fm authorization.");
      }
    }

    async function verifyLastFmAuthorization() {
      if (!lastFmAuthToken) {
        await connectLastFm();
        return;
      }
      try {
        const result = await backendRequest("/api/lastfm/session", {
          apiKey: settingsState.lastFmApiKey,
          token: lastFmAuthToken
        });
        settingsState.lastFmSessionKey = result.sessionKey;
        settingsState.lastFmUsername = result.username;
        settingsState.lastFmScrobbling = true;
        lastFmAuthToken = "";
        persistSettings();
        renderSettingsView();
        if (!audio.paused) void updateLastFmNowPlaying();
        showToast(`Last.fm connected as ${result.username}.`);
      } catch (error) {
        console.error("Last.fm account authorization failed:", error);
        showToast(error.message || "Unable to connect the Last.fm account.");
      }
    }

    async function sendLastFmTrackEvent(eventName, track, duration) {
      if (!settingsState.lastFmApiKey || !settingsState.lastFmSessionKey) {
        throw new Error("Connect a Last.fm account before sending track updates.");
      }
      await backendRequest("/api/lastfm/track", {
        apiKey: settingsState.lastFmApiKey,
        sessionKey: settingsState.lastFmSessionKey,
        event: eventName,
        track: {
          title: track.title,
          artist: track.artist,
          album: track.album || "",
          duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : undefined,
          timestamp: lastFmTrackStartedAt || Math.floor(Date.now() / 1000)
        }
      });
    }

    async function updateLastFmNowPlaying() {
      const track = tracks[activeTrack];
      if (!settingsState.lastFmScrobbling || !settingsState.lastFmNowPlaying ||
        !settingsState.lastFmSessionKey || !track || !audio.currentSrc ||
        lastFmNowPlayingTrackId === track.id) return;
      lastFmNowPlayingTrackId = track.id;
      try {
        await sendLastFmTrackEvent("now-playing", track, audio.duration);
      } catch (error) {
        if (lastFmNowPlayingTrackId === track.id) lastFmNowPlayingTrackId = "";
        console.error("Last.fm now-playing update failed:", error);
        showToast(error.message || "Unable to send Last.fm now-playing update.");
      }
    }

    async function maybeScrobbleCurrentTrack() {
      const track = tracks[activeTrack];
      if (!settingsState.lastFmScrobbling || !settingsState.lastFmSessionKey ||
        !track || !Number.isFinite(audio.duration) || audio.duration <= 30 ||
        lastFmScrobbledTrackId === track.id) return;
      if (audio.currentTime / audio.duration * 100 < settingsState.lastFmThreshold) return;
      lastFmScrobbledTrackId = track.id;
      try {
        await sendLastFmTrackEvent("scrobble", track, audio.duration);
        logDiagnostic(`Scrobbled "${track.title}" to Last.fm`);
      } catch (error) {
        console.error("Last.fm scrobble failed:", error);
        showToast(error.message || "Unable to scrobble this track to Last.fm.");
      }
    }

    function loadGoogleIdentityServices() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        return Promise.resolve(window.google.accounts.oauth2);
      }
      if (youtubeClientScriptPromise) return youtubeClientScriptPromise;
      youtubeClientScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => {
          if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            resolve(window.google.accounts.oauth2);
          } else {
            reject(new Error("Google Identity Services did not initialize."));
          }
        };
        script.onerror = () => reject(new Error("Unable to load Google Identity Services."));
        document.head.appendChild(script);
      }).catch((error) => {
        youtubeClientScriptPromise = null;
        throw error;
      });
      return youtubeClientScriptPromise;
    }

    async function connectYouTube() {
      const clientIdInput = document.querySelector("[data-youtube-client-id]");
      if (clientIdInput) settingsState.youtubeOAuthClientId = clientIdInput.value.trim();
      const clientId = settingsState.youtubeOAuthClientId;
      if (!clientId) {
        showToast("Enter your Google OAuth Client ID first.");
        return;
      }
      try {
        persistSettings();
        const oauth = window.google && window.google.accounts && window.google.accounts.oauth2
          ? window.google.accounts.oauth2
          : await loadGoogleIdentityServices();
        youtubeOAuthReady = true;
        youtubeTokenClient = oauth.initTokenClient({
          client_id: clientId,
          scope: "https://www.googleapis.com/auth/youtube",
          callback: (response) => {
            if (response.error || !response.access_token) {
              showToast(response.error_description || response.error || "Google authorization failed.");
              return;
            }
            youtubeAccessToken = response.access_token;
            settingsState.youtubeConnected = true;
            renderSettingsView();
            showToast("YouTube account connected for this browser session.");
          },
          error_callback: (error) => {
            showToast(error.message || "Google authorization popup failed.");
          }
        });
        youtubeTokenClient.requestAccessToken({ prompt: "consent" });
      } catch (error) {
        console.error("YouTube account connection failed:", error);
        showToast(error.message || "Unable to connect the YouTube account.");
      }
    }

    async function youtubeApiRequest(resource, params, method = "GET", body) {
      if (!youtubeAccessToken) throw new Error("Add your Google account in Integrations first.");
      const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
      Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${youtubeAccessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result.error && result.error.message;
        if (response.status === 401) {
          youtubeAccessToken = "";
          settingsState.youtubeConnected = false;
        }
        throw new Error(message || `YouTube Data API returned HTTP ${response.status}.`);
      }
      return result;
    }

    async function getOrCreateYouTubePlaylist() {
      if (settingsState.youtubePlaylistId) {
        const stored = await youtubeApiRequest("playlists", {
          part: "snippet,status",
          id: settingsState.youtubePlaylistId
        });
        const playlist = stored.items && stored.items[0];
        if (playlist) {
          if (playlist.status && playlist.status.privacyStatus !== "private") {
            await youtubeApiRequest("playlists", { part: "snippet,status" }, "PUT", {
              id: playlist.id,
              snippet: {
                title: playlist.snippet.title,
                description: playlist.snippet.description || ""
              },
              status: { privacyStatus: "private" }
            });
          }
          return playlist.id;
        }
        settingsState.youtubePlaylistId = "";
        settingsState.youtubeSyncedTrackIds = [];
        persistSettings();
      }
      let pageToken = "";
      do {
        const params = { part: "snippet,status", mine: "true", maxResults: "50" };
        if (pageToken) params.pageToken = pageToken;
        const result = await youtubeApiRequest("playlists", params);
        const playlist = (result.items || []).find((item) =>
          item.snippet && item.snippet.title === "MusicHeaven Library");
        if (playlist) {
          settingsState.youtubePlaylistId = playlist.id;
          if (!playlist.status || playlist.status.privacyStatus !== "private") {
            await youtubeApiRequest("playlists", { part: "snippet,status" }, "PUT", {
              id: playlist.id,
              snippet: {
                title: playlist.snippet.title,
                description: playlist.snippet.description || ""
              },
              status: { privacyStatus: "private" }
            });
          }
          persistSettings();
          return playlist.id;
        }
        pageToken = result.nextPageToken || "";
      } while (pageToken);

      const created = await youtubeApiRequest("playlists", { part: "snippet,status" }, "POST", {
        snippet: { title: "MusicHeaven Library", description: "Synced from the MusicHeaven local library." },
        status: { privacyStatus: "private" }
      });
      if (!created.id) throw new Error("YouTube did not return the new playlist ID.");
      settingsState.youtubePlaylistId = created.id;
      persistSettings();
      return created.id;
    }

    async function syncYouTubeLibrary(button) {
      if (!settingsState.youtubeMusicSync) {
        showToast("Turn on YouTube Music sync in Library first.");
        return;
      }
      if (!youtubeAccessToken) {
        showToast("Add your Google account in Integrations first.");
        return;
      }
      const localTracks = tracks.filter((track) => track.localFile || track.file || track.sourceUri);
      if (!localTracks.length) {
        showToast("Import local audio tracks before syncing to YouTube.");
        return;
      }
      youtubeSyncInProgress = true;
      if (button) {
        button.disabled = true;
        button.textContent = "Syncing…";
      }
      try {
        const playlistId = await getOrCreateYouTubePlaylist();
        const syncedIds = new Set(settingsState.youtubeSyncedTrackIds);
        const pending = localTracks.filter((track) => !syncedIds.has(track.id)).slice(0, 20);
        if (!pending.length) {
          showToast("All imported tracks are already synced to the private playlist.");
          return;
        }
        let added = 0;
        let notFound = 0;
        for (const track of pending) {
          const artist = ["Local audio", "Unknown artist"].includes(track.artist) ? "" : track.artist;
          const query = [track.title, artist].filter(Boolean).join(" ");
          const search = await youtubeApiRequest("search", {
            part: "snippet",
            type: "video",
            maxResults: "1",
            q: query
          });
          const videoId = search.items && search.items[0] && search.items[0].id && search.items[0].id.videoId;
          if (!videoId) {
            notFound += 1;
            continue;
          }
          await youtubeApiRequest("playlistItems", { part: "snippet" }, "POST", {
            snippet: {
              playlistId,
              resourceId: { kind: "youtube#video", videoId }
            }
          });
          syncedIds.add(track.id);
          added += 1;
          settingsState.youtubeSyncedTrackIds = Array.from(syncedIds);
          persistSettings();
        }
        const remaining = localTracks.filter((track) => !syncedIds.has(track.id)).length;
        showToast(`${added} track${added === 1 ? "" : "s"} added${notFound ? `; ${notFound} not found` : ""}${remaining ? `; ${remaining} remaining for later` : ""}.`);
      } catch (error) {
        console.error("YouTube private playlist sync failed:", error);
        showToast(error.message || "Unable to sync tracks to YouTube.");
      } finally {
        youtubeSyncInProgress = false;
        if (button && button.isConnected) {
          button.disabled = false;
          button.textContent = "Sync now";
        }
      }
    }

    async function importBackup(file) {
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const playlist = payload && payload.playlist;
        if (!payload || payload.app !== "MusicHeaven" || payload.version !== 1 ||
          !payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings) ||
          (playlist !== null && (!playlist || !Array.isArray(playlist.tracks) ||
            playlist.tracks.some((track) => !track || typeof track.id !== "string" || typeof track.title !== "string") ||
            (playlist.importedFolders !== undefined && !Array.isArray(playlist.importedFolders))))) {
          throw new Error("This file is not a valid MusicHeaven backup.");
        }
        if (!window.confirm("Import this backup and replace the saved playlist metadata and settings? Audio files are not included.")) return;
        const importedSettings = { ...defaultSettings };
        Object.keys(defaultSettings).forEach((key) => {
          if (typeof payload.settings[key] === typeof defaultSettings[key]) importedSettings[key] = payload.settings[key];
        });
        importedSettings.lastFmSessionKey = "";
        importedSettings.lastFmUsername = "";
        importedSettings.lastFmScrobbling = false;
        importedSettings.youtubeConnected = false;
        if (typeof importedSettings.accentColor !== "string" || !/^#[0-9a-f]{6}$/i.test(importedSettings.accentColor)) {
          importedSettings.accentColor = defaultSettings.accentColor;
        }
        importedSettings.defaultVolume = Math.max(0, Math.min(1, Number(importedSettings.defaultVolume) || 0));
        const previousSettings = localStorage.getItem(settingsStorageKey);
        const previousPlaylist = localStorage.getItem(playlistStorageKey);
        try {
          localStorage.setItem(settingsStorageKey, JSON.stringify(importedSettings));
          if (playlist) localStorage.setItem(playlistStorageKey, JSON.stringify(playlist));
          else localStorage.removeItem(playlistStorageKey);
        } catch (error) {
          if (previousSettings === null) localStorage.removeItem(settingsStorageKey);
          else localStorage.setItem(settingsStorageKey, previousSettings);
          if (previousPlaylist === null) localStorage.removeItem(playlistStorageKey);
          else localStorage.setItem(playlistStorageKey, previousPlaylist);
          throw error;
        }
        location.reload();
      } catch (error) {
        console.error("Backup import failed:", error);
        showToast(error instanceof SyntaxError ? "The selected backup is not valid JSON." : error.message || "Unable to import this backup.");
      }
    }

    function updateMediaSessionMetadata() {
      if (!mediaSession || typeof window.MediaMetadata !== "function") return;
      const track = tracks[activeTrack];
      if (!track) return;
      const artwork = track.artwork
        ? [{ src: track.artwork }]
        : [{ src: defaultMediaArtwork, type: "image/png" }];
      mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: track.artist || "Unknown artist",
        album: track.album || "MusicHeaven",
        artwork
      });
    }

    function updateMediaSessionPositionState() {
      if (!mediaSession || typeof mediaSession.setPositionState !== "function") return;
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        mediaSession.setPositionState();
        return;
      }
      const position = Number.isFinite(audio.currentTime)
        ? Math.max(0, Math.min(audio.currentTime, audio.duration))
        : 0;
      mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position
      });
    }

    function seekAudioTo(position) {
      if (!Number.isFinite(position) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      audio.currentTime = Math.max(0, Math.min(position, audio.duration));
      updateMediaSessionPositionState();
    }

    function registerMediaSessionAction(action, handler) {
      if (!mediaSession || typeof mediaSession.setActionHandler !== "function") return;
      try {
        mediaSession.setActionHandler(action, handler);
      } catch (error) {
        if (error && typeof error === "object" && error.name === "NotSupportedError") return;
        throw error;
      }
    }

    function setupMediaSession() {
      if (!mediaSession) return;
      registerMediaSessionAction("play", () => {
        if (audio.paused) void togglePlayback();
      });
      registerMediaSessionAction("pause", () => audio.pause());
      registerMediaSessionAction("previoustrack", () => stepTrack(-1));
      registerMediaSessionAction("nexttrack", () => stepTrack(1));
      registerMediaSessionAction("seekto", ({ seekTime }) => seekAudioTo(seekTime));
      registerMediaSessionAction("seekbackward", ({ seekOffset }) => {
        seekAudioTo(audio.currentTime - (Number.isFinite(seekOffset) ? seekOffset : 10));
      });
      registerMediaSessionAction("seekforward", ({ seekOffset }) => {
        seekAudioTo(audio.currentTime + (Number.isFinite(seekOffset) ? seekOffset : 10));
      });
    }

    function updatePlayState() {
      const playing = !audio.paused;
      stage.classList.toggle("is-playing", playing);
      playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
      playButton.title = playing ? "Pause" : "Play";
      playButton.innerHTML = icon(playing ? "i-pause" : "i-play");
      const nowPlayingPlay = document.getElementById("now-playing-play");
      nowPlayingPlay.setAttribute("aria-label", playing ? "Pause" : "Play");
      nowPlayingPlay.innerHTML = `${icon(playing ? "i-pause" : "i-play")}<span>${playing ? "Pause" : "Play"}</span>`;
      if (mediaSession && "playbackState" in mediaSession) {
        mediaSession.playbackState = audio.src ? (playing ? "playing" : "paused") : "none";
      }
      updateMediaSessionPositionState();
    }

    async function togglePlayback() {
      if (!audio.src) {
        showToast("No audio file is available for this track.");
        return;
      }
      if (audio.paused) {
        try {
          connectAudio();
          if (audioContext && audioContext.state === "suspended") await audioContext.resume();
          await audio.play();
        } catch (error) {
          showToast("Unable to play this audio file.");
          console.error("Audio playback failed:", error);
        }
      } else {
        audio.pause();
      }
      updatePlayState();
    }

    function setTrack(index, autoplay) {
      if (!playbackTrackIndices.includes(index)) index = playbackTrackIndices[0];
      activeTrack = index;
      lastFmNowPlayingTrackId = "";
      lastFmScrobbledTrackId = "";
      lastFmTrackStartedAt = 0;
      if (shuffleOn) shuffleQueue = shuffleQueue.filter((queuedIndex) => queuedIndex !== activeTrack);
      const track = tracks[activeTrack];
      mixFadeScheduledForTrack = null;
      if (outputGain && settingsState.timedMix) {
        const now = audioContext.currentTime;
        outputGain.gain.cancelScheduledValues(now);
        outputGain.gain.setValueAtTime(0, now);
        outputGain.gain.linearRampToValueAtTime(1, now + 1.25);
      }
      document.getElementById("current-title").textContent = track.title;
      document.getElementById("current-artist").textContent = track.artist;
      document.getElementById("player-art").className = `player-art art-${activeTrack % 8 + 1}`;
      setArtwork(document.getElementById("player-art"), track);
      document.querySelectorAll(".track").forEach((item) => item.classList.toggle("current", Number(item.dataset.track) === activeTrack));
      document.querySelectorAll(".queue-cover").forEach((item) => item.classList.toggle("active", Number(item.dataset.track) === activeTrack));
      updateFavoriteButton();
      if (track.src) {
        audio.src = track.src;
        audio.load();
      } else {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        elapsed.textContent = "00:00";
        duration.textContent = track.time;
        seek.value = "0";
        setSeekFill(0);
      }

      updatePlayState();
      updateNowPlaying();
      updateNowPlayingProgress();
      if (autoplay) {
        if (track.src) togglePlayback();
        else showToast("Demo track—add an audio file to play it.");
      }
    }

    function scheduleTimedMixFadeOut() {
      if (!settingsState.timedMix || !outputGain || !Number.isFinite(audio.duration) ||
        audio.duration <= 0 || mixFadeScheduledForTrack === tracks[activeTrack]?.id) return;
      const remaining = audio.duration - audio.currentTime;
      if (remaining > 1.8 || remaining < 0) return;
      const now = audioContext.currentTime;
      outputGain.gain.cancelScheduledValues(now);
      outputGain.gain.setValueAtTime(outputGain.gain.value, now);
      outputGain.gain.linearRampToValueAtTime(0, now + Math.max(.05, remaining));
      mixFadeScheduledForTrack = tracks[activeTrack]?.id;
    }

    function playTrackFromCard(index) {
      setTrack(index, true);
      openNowPlaying();
    }

    function playHomeRadio() {
      if (featuredTrackIndex < 0) {
        showToast(`No tracks match the ${activeMoodFilter} filter.`);
        return;
      }
      playbackTrackIndices = getHomeRecommendations().map(({ index }) => index);
      setTrack(featuredTrackIndex, true);
    }

    function playGenreRadio(genre) {
      const genreKeywords = {
        Indie: ["indie", "independent", "alternative"],
        Hindi: ["hindi", "bollywood", "hindustani"],
        Indian: ["indian", "bengali", "bangla", "tamil", "telugu", "punjabi", "marathi", "kannada", "malayalam"],
        Pop: ["pop"]
      };
      const keywords = genreKeywords[genre] || [genre.toLowerCase()];
      const matchingTracks = tracks.map((track, index) => ({ track, index }))
        .filter(({ track }) => {
          if (settingsState.hiddenTrackIds.includes(track.id)) return false;
          const searchable = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLowerCase();
          return keywords.some((keyword) => searchable.includes(keyword));
        });
      if (!matchingTracks.length) {
        showToast(`No ${genre} tracks found in your library metadata.`);
        return;
      }
      playbackTrackIndices = matchingTracks.map(({ index }) => index);
      activeFolderSelection = null;
      setTrack(playbackTrackIndices[0], true);
      showToast(`${genre} radio started.`);
    }

    function stepTrack(direction) {
      if (!playbackTrackIndices.length) return;
      if (direction > 0 && shuffleOn) {
        if (!shuffleQueue.length) resetShuffleQueue();
        const nextIndex = shuffleQueue.shift();
        if (nextIndex !== undefined) setTrack(nextIndex, true);
        else if (repeatMode === "all") setTrack(activeTrack, true);
        return;
      }
      const currentPosition = playbackTrackIndices.indexOf(activeTrack);
      const nextPosition = (currentPosition + direction + playbackTrackIndices.length) % playbackTrackIndices.length;
      setTrack(playbackTrackIndices[nextPosition], true);
    }

    function resetShuffleQueue() {
      shuffleQueue = playbackTrackIndices.filter((index) => index !== activeTrack);
      for (let index = shuffleQueue.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffleQueue[index], shuffleQueue[swapIndex]] = [shuffleQueue[swapIndex], shuffleQueue[index]];
      }
    }

    function toggleShuffle() {
      shuffleOn = !shuffleOn;
      if (shuffleOn) resetShuffleQueue();
      else shuffleQueue = [];
      updateShuffleButton();
      showToast(shuffleOn ? "Shuffle is on" : "Shuffle is off");
    }

    function updateShuffleButton() {
      [document.getElementById("shuffle"), document.getElementById("now-playing-shuffle")].forEach((button) => {
        button.classList.toggle("selected", shuffleOn);
        button.setAttribute("aria-pressed", String(shuffleOn));
        button.setAttribute("aria-label", shuffleOn ? "Shuffle on" : "Shuffle off");
        button.title = shuffleOn ? "Shuffle on" : "Shuffle off";
      });
    }

    function updateRepeatButton() {
      const labels = { off: "Repeat off", all: "Repeat all", one: "Repeat one" };
      [document.getElementById("repeat"), document.getElementById("now-playing-repeat")].forEach((button) => {
        button.dataset.repeatMode = repeatMode;
        button.classList.toggle("selected", repeatMode !== "off");
        button.setAttribute("aria-pressed", String(repeatMode !== "off"));
        button.setAttribute("aria-label", labels[repeatMode]);
        button.title = labels[repeatMode];
      });
      audio.loop = repeatMode === "one";
    }

    function updateFavoriteButton() {
      const button = document.getElementById("player-like");
      const track = tracks[activeTrack];
      const isFavorite = Boolean(track && favoriteTrackIds.has(track.id));
      button.classList.toggle("is-liked", isFavorite);
      button.setAttribute("aria-pressed", String(isFavorite));
      button.setAttribute("aria-label", isFavorite
        ? `Unlike ${track.title}`
        : `Like ${track ? track.title : "current track"}`);
      button.title = isFavorite ? "Unlike this track" : "Like this track";
      button.innerHTML = icon(isFavorite ? "i-heart-fill" : "i-heart");
      const nowPlayingLike = document.getElementById("now-playing-like");
      nowPlayingLike.classList.toggle("is-liked", isFavorite);
      nowPlayingLike.setAttribute("aria-pressed", String(isFavorite));
      nowPlayingLike.setAttribute("aria-label", isFavorite ? `Unlike ${track.title}` : `Like ${track ? track.title : "current track"}`);
      nowPlayingLike.title = isFavorite ? "Unlike this track" : "Like this track";
      nowPlayingLike.innerHTML = icon(isFavorite ? "i-heart-fill" : "i-heart");
    }

    function toggleTrackFavorite(index) {
      const track = tracks[index];
      if (!track || !track.id) return;
      const isFavorite = favoriteTrackIds.has(track.id);
      if (isFavorite) favoriteTrackIds.delete(track.id);
      else favoriteTrackIds.add(track.id);
      for (const cacheKey of groupedTracksCache.keys()) {
        if (cacheKey.includes(":Liked Songs:")) groupedTracksCache.delete(cacheKey);
      }
      settingsState.favoriteTrackIds = Array.from(favoriteTrackIds);
      persistSettings();
      updateFavoriteButton();
      const heart = list.querySelector(`.track[data-track="${index}"] .track-heart`);
      if (heart) {
        heart.classList.toggle("is-liked", !isFavorite);
        heart.innerHTML = icon(isFavorite ? "i-heart" : "i-heart-fill");
      }
      if (activeNavigationView === "library" && activeLibraryCategory === "Liked Songs") {
        renderTrackList(true);
      }
      showToast(isFavorite ? "Removed from Liked Songs" : "Added to Liked Songs");
    }

    function setSeekFill(progress) {
      seek.style.background = `linear-gradient(90deg, #62eaff 0%, #a76bff ${progress}%, rgba(255,255,255,.13) ${progress}%)`;
      nowPlayingSeek.style.setProperty("--progress", `${progress}%`);
    }

    function updateAudioOutputButton() {
      const button = document.getElementById("now-playing-output");
      const label = audio.muted ? "Unmute audio" : "Mute audio";
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(audio.muted));
      button.title = label;
      button.innerHTML = icon(audio.muted ? "i-volume-off" : "i-volume");
    }

    function showToast(message) {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.classList.add("visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("visible"), 2300);
    }

    const audioExtensions = new Set(["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "webm", "wma"]);
    function isAudioFile(file) {
      const extensionIndex = file.name.lastIndexOf(".");
      const extension = extensionIndex > -1 ? file.name.slice(extensionIndex + 1).toLowerCase() : "";
      return audioExtensions.has(extension) || file.type.toLowerCase().startsWith("audio/");
    }

    function createImportedTrack(file, folderStructureId) {
      const relativePath = file.webkitRelativePath || file.name;
      const pathParts = relativePath.split("/");
      const fileName = pathParts[pathParts.length - 1];
      const extensionIndex = fileName.lastIndexOf(".");
      const title = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
      const artist = pathParts.length > 2 ? pathParts.slice(1, -1).join(" / ") : "Local audio";
      const src = URL.createObjectURL(file);
      importedObjectUrls.push(src);
      return {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title,
        artist,
        album: "Unknown album",
        genre: "Unknown genre",
        format: extensionIndex > -1 ? fileName.slice(extensionIndex + 1).toLowerCase() : "",
        folder: pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "Selected files",
        folderStructureId,
        time: "--:--",
        src,
        file,
        localFile: true
      };
    }

    function createImportedUriTrack(file, folderStructureId) {
      const relativePath = (file.relativePath || file.name).replace(/\\/g, "/");
      const pathParts = relativePath.split("/").filter(Boolean);
      const fileName = pathParts[pathParts.length - 1];
      const extensionIndex = fileName.lastIndexOf(".");
      const capacitor = window.Capacitor;
      if (!capacitor || typeof capacitor.convertFileSrc !== "function") {
        throw new Error("Capacitor cannot load audio files from the selected Android folder.");
      }

      return {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName,
        artist: pathParts.length > 2 ? pathParts.slice(1, -1).join(" / ") : "Local audio",
        album: "Unknown album",
        genre: "Unknown genre",
        format: extensionIndex > -1 ? fileName.slice(extensionIndex + 1).toLowerCase() : "",
        folder: pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "Selected files",
        folderStructureId,
        time: "--:--",
        src: capacitor.convertFileSrc(file.uri),
        sourceUri: file.uri,
        fileSize: Number(file.size) || 0,
        file: null,
        localFile: true
      };
    }

    function buildImportedFolderStructure(id, name, importedTracks) {
      const root = { name, path: name, trackIds: [], folders: [] };
      importedTracks.forEach((track) => {
        root.trackIds.push(track.id);
        const pathParts = track.folder.split("/").filter(Boolean);
        if (pathParts[0] === name) pathParts.shift();
        let parent = root;
        pathParts.forEach((part) => {
          let folder = parent.folders.find((item) => item.name === part);
          if (!folder) {
            folder = {
              name: part,
              path: `${parent.path}/${part}`,
              trackIds: [],
              folders: []
            };
            parent.folders.push(folder);
          }
          folder.trackIds.push(track.id);
          parent = folder;
        });
      });
      return { id, ...root };
    }

    function metadataText(value) {
      if (typeof value === "string" || typeof value === "number") return String(value).trim();
      if (value && typeof value === "object" && typeof value.text === "string") return value.text.trim();
      return "";
    }

    function extractTrackMetadata(file, reader, title) {
      return new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
          console.warn(`Timed out reading ID3 metadata for "${title}".`);
          finish(null);
        }, 15000);
        const finish = (metadata) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(metadata);
        };
        try {
          reader.read(file, {
            onSuccess: ({ tags = {} } = {}) => {
              try {
                finish({
                  title: metadataText(tags.title),
                  artist: metadataText(tags.artist),
                  album: metadataText(tags.album),
                  genre: metadataText(tags.genre),
                  artwork: pictureDataUrl(tags.picture),
                  lyrics: parseLyrics(tags.synchronisedLyrics || tags.lyrics || tags.unsynchronisedLyrics)
                });
              } catch (error) {
                console.warn(`Unable to parse ID3 metadata for "${title}":`, error);
                finish(null);
              }
            },
            onError: (error) => {
              console.warn(`Unable to read ID3 metadata for "${title}":`, error);
              finish(null);
            }
          });
        } catch (error) {
          console.warn(`Unable to read ID3 metadata for "${title}":`, error);
          finish(null);
        }
      });
    }

    function readTrackMetadata(track, generation) {
      const reader = window.jsmediatags;
      if (!reader || typeof reader.read !== "function") {
        console.error("jsmediatags is unavailable; audio metadata could not be read.");
        showToast("Audio metadata reader is unavailable. Check your internet connection.");
        return Promise.resolve();
      }
      if (!(track.file instanceof Blob)) return Promise.resolve();
      let metadataPromise = parsedTrackMetadataCache.get(track.file);
      if (!metadataPromise) {
        metadataPromise = new Promise((resolve) => {
          const extract = () => extractTrackMetadata(track.file, reader, track.title).then(resolve);
          if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(extract, { timeout: 500 });
          } else {
            setTimeout(extract, 0);
          }
        });
        parsedTrackMetadataCache.set(track.file, metadataPromise);
      }
      return metadataPromise.then((metadata) => {
        if (generation !== importGeneration || !metadata) return;
        const title = metadata.title || track.title;
        const artist = metadata.artist || track.artist;
        const album = metadata.album || track.album;
        const genre = metadata.genre || track.genre;
        const groupingChanged = title !== track.title || artist !== track.artist ||
          album !== track.album || genre !== track.genre;
        const artwork = metadata.artwork || track.artwork || "";
        const artworkChanged = artwork !== (track.artwork || "");
        track.title = title;
        track.artist = artist;
        track.album = album;
        track.genre = genre;
        track.artwork = artwork;
        track.lyrics = metadata.lyrics;
        if (artworkChanged) {
          const trackIndex = tracks.indexOf(track);
          if (trackIndex >= 0) {
            const cover = list.querySelector(`.track[data-track="${trackIndex}"] .cover`);
            if (cover) setArtwork(cover, track);
          }
        }
        if (groupingChanged || artworkChanged) scheduleLibraryRefresh(false, groupingChanged);
        if (activeTrack === tracks.indexOf(track)) {
          currentLyricsTrackId = null;
          updateNowPlaying();
        }
      });
    }

    function openPlaylistDatabase() {
      if (playlistDatabase) return Promise.resolve(playlistDatabase);
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("MusicHeavenPlaylist", 1);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("audio")) {
            database.createObjectStore("audio", { keyPath: "id" });
          }
        };
        request.onsuccess = () => {
          playlistDatabase = request.result;
          resolve(playlistDatabase);
        };
        request.onerror = () => reject(request.error || new Error("Unable to open the local audio library."));
      });
    }

    async function saveAudioFile(track) {
      const database = await openPlaylistDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction("audio", "readwrite");
        transaction.objectStore("audio").put({ id: track.id, blob: track.file });
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Unable to save an audio file."));
        transaction.onabort = () => reject(transaction.error || new Error("Saving an audio file was interrupted."));
      });
    }

    async function loadAudioFile(id) {
      const database = await openPlaylistDatabase();
      return new Promise((resolve, reject) => {
        const request = database.transaction("audio", "readonly").objectStore("audio").get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("Unable to load a saved audio file."));
      });
    }

    async function persistPlaylist({ saveAudioFiles = false } = {}) {
      const localTracks = tracks.filter((track) => track.localFile);
      if (!localTracks.length) return;
      const generation = importGeneration;
      try {
        if (saveAudioFiles) {
          for (const track of localTracks) {
            if (track.file) await saveAudioFile(track);
          }
        }
        if (generation !== importGeneration) return;
        const savedTracks = localTracks.map(({ id, title, artist, album, genre, folder, folderStructureId, format, time, sourceUri, fileSize }) => ({
          id, title, artist, album, genre, folder, folderStructureId, format, time, sourceUri, fileSize
        }));
        localStorage.setItem(playlistStorageKey, JSON.stringify({
          folderName: libraryFolderName,
          activeTrack,
          category: activeLibraryCategory,
          selectedFolder: activeFolderSelection,
          importedFolders: importedFolderStructures,
          tracks: savedTracks
        }));
      } catch (error) {
        console.error("Playlist persistence failed:", error);
        showToast("Unable to save this playlist in browser storage.");
      }
    }

    async function restorePlaylist() {
      const generation = importGeneration;
      let savedPlaylist;
      try {
        const storedPlaylist = localStorage.getItem(playlistStorageKey);
        if (!storedPlaylist) return;
        savedPlaylist = JSON.parse(storedPlaylist);
        if (!savedPlaylist || !Array.isArray(savedPlaylist.tracks)) {
          throw new Error("The saved playlist has an invalid format.");
        }
      } catch (error) {
        console.error("Saved playlist could not be read:", error);
        showToast("Unable to read the saved playlist.");
        return;
      }

      try {
        const restoredTracks = [];
        const restoredObjectUrls = [];
        for (const savedTrack of savedPlaylist.tracks) {
          const storedAudio = await loadAudioFile(savedTrack.id);
          if (storedAudio && storedAudio.blob instanceof Blob) {
            const src = URL.createObjectURL(storedAudio.blob);
            restoredObjectUrls.push(src);
            restoredTracks.push({
              ...savedTrack,
              src,
              file: storedAudio.blob,
              localFile: true
            });
          } else if (savedTrack.sourceUri && window.Capacitor && typeof window.Capacitor.convertFileSrc === "function") {
            restoredTracks.push({
              ...savedTrack,
              src: window.Capacitor.convertFileSrc(savedTrack.sourceUri),
              file: null,
              localFile: true
            });
          }
        }
        if (generation !== importGeneration) {
          restoredObjectUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        if (!restoredTracks.length) {
          showToast("Saved audio files are unavailable in browser storage.");
          return;
        }
        importedObjectUrls.push(...restoredObjectUrls);
        tracks = restoredTracks;
        invalidateLibraryCaches();
        importedFolderStructures = Array.isArray(savedPlaylist.importedFolders)
          ? savedPlaylist.importedFolders
          : [];
        if (!importedFolderStructures.length) {
          const restoredFolders = new Map();
          restoredTracks.forEach((track) => {
            const name = (track.folder || "Unsorted").split("/")[0];
            const id = track.folderStructureId || `restored-${name}`;
            track.folderStructureId = id;
            if (!restoredFolders.has(id)) restoredFolders.set(id, { id, name, tracks: [] });
            restoredFolders.get(id).tracks.push(track);
          });
          importedFolderStructures = Array.from(restoredFolders.values())
            .map((folder) => buildImportedFolderStructure(folder.id, folder.name, folder.tracks));
        }
        if (libraryCategories.includes(savedPlaylist.category)) activeLibraryCategory = savedPlaylist.category;
        activeFolderSelection = savedPlaylist.selectedFolder || null;
        playbackTrackIndices = activeFolderSelection
          ? tracks.reduce((indices, track, index) => {
            if ((track.folder || "Unsorted") === activeFolderSelection) indices.push(index);
            return indices;
          }, [])
          : tracks.map((track, index) => index);
        if (!playbackTrackIndices.length) activeFolderSelection = null;
        if (!activeFolderSelection) playbackTrackIndices = tracks.map((track, index) => index);
        activeTrack = Math.min(Math.max(Number(savedPlaylist.activeTrack) || 0, 0), tracks.length - 1);
        if (!playbackTrackIndices.includes(activeTrack)) activeTrack = playbackTrackIndices[0];
        document.getElementById("search").value = "";
        renderPlaylist(savedPlaylist.folderName || "");
        setTrack(activeTrack, false);
        void readTrackDetails(restoredTracks, generation);
        if (restoredTracks.length !== savedPlaylist.tracks.length) {
          showToast("Some saved audio files were unavailable and could not be restored.");
        }
      } catch (error) {
        console.error("Saved audio could not be restored:", error);
        showToast("Unable to restore the saved audio files.");
      }
    }

    function readTrackDuration(track, generation) {
      return new Promise((resolve) => {
        const probe = new Audio();
        let settled = false;
        const timeout = setTimeout(() => finish(null), 15000);
        const finish = (seconds) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          probe.removeEventListener("loadedmetadata", onLoadedMetadata);
          probe.removeEventListener("error", onError);
          if (generation === importGeneration && Number.isFinite(seconds)) {
            track.time = formatTime(seconds).replace(/^0/, "");
            const index = tracks.indexOf(track);
            const row = list.querySelector(`.track[data-track="${index}"] .track-time`);
            if (row) row.textContent = track.time;
            if (activeTrack === index) updateNowPlayingAudioQuality(track);
          }
          resolve();
        };
        const onLoadedMetadata = () => finish(probe.duration);
        const onError = () => finish(null);
        probe.preload = "metadata";
        probe.addEventListener("loadedmetadata", onLoadedMetadata);
        probe.addEventListener("error", onError);
        probe.src = track.src;
        probe.load();
      });
    }

    async function readTrackDetails(importedTracks, generation) {
      let nextIndex = 0;
      const workerCount = Math.min(2, importedTracks.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (generation === importGeneration && nextIndex < importedTracks.length) {
          const track = importedTracks[nextIndex];
          nextIndex += 1;
          await readTrackMetadata(track, generation);
          if (!track.time || track.time === "--:--") await readTrackDuration(track, generation);
        }
      });
      await Promise.all(workers);
      if (generation === importGeneration) {
        scheduleLibraryRefresh(true);
        await persistPlaylist();
      }
    }

    function importAudioFiles(files) {
      const supportedFiles = files
        .filter(isAudioFile)
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: "base" }));
      if (!supportedFiles.length) {
        showToast("No supported audio files were found in the selection.");
        return;
      }

      audio.pause();
      const generation = ++importGeneration;
      const previousTracks = tracks.filter((track) => track.localFile);
      const folderName = supportedFiles[0].webkitRelativePath
        ? supportedFiles[0].webkitRelativePath.split("/")[0]
        : "Selected files";
      const folderStructureId = `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newTracks = supportedFiles.map((file) => createImportedTrack(file, folderStructureId));
      logDiagnostic("Audio files imported", { count: newTracks.length });
      tracks = [...previousTracks, ...newTracks];
      invalidateLibraryCaches();
      importedFolderStructures.push(buildImportedFolderStructure(folderStructureId, folderName, newTracks));
      activeFolderSelection = null;
      playbackTrackIndices = tracks.map((track, index) => index);
      setActiveNavigationView("library");
      activeTrack = previousTracks.length;
      if (activeLibraryCategory === "Folders") activeLibraryCategory = "Songs";
      updateMobileNavigation();
      document.getElementById("search").value = "";
      const collectionName = importedFolderStructures.length === 1
        ? folderName
        : `${importedFolderStructures.length} imported folders`;
      renderPlaylist(collectionName);
      setTrack(activeTrack, false);
      void persistPlaylist({ saveAudioFiles: true });
      showToast(`${newTracks.length} audio ${newTracks.length === 1 ? "file" : "files"} loaded. Ready to play.`);
      void readTrackDetails(newTracks, generation);
    }

    async function importAndroidFolder() {
      const capacitor = window.Capacitor;
      if (
        !capacitor
        || typeof capacitor.getPlatform !== "function"
        || capacitor.getPlatform() !== "android"
        || typeof capacitor.nativePromise !== "function"
      ) {
        return false;
      }

      try {
        const result = await capacitor.nativePromise("AudioFolderPicker", "pickFolder", {});
        if (result.cancelled) return true;
        const folderFiles = Array.isArray(result.files) ? result.files : [];
        if (!folderFiles.length) {
          showToast("No supported audio files were found in the selected folder.");
          return true;
        }

        const folderStructureId = `folder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const folderName = result.folderName || "Imported folder";
        const newTracks = folderFiles
          .filter((file) => file && file.uri && file.name)
          .map((file) => createImportedUriTrack(file, folderStructureId))
          .sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true, sensitivity: "base" })
            || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
        if (!newTracks.length) {
          showToast("No supported audio files were found in the selected folder.");
          return true;
        }

        audio.pause();
        const generation = ++importGeneration;
        const previousTracks = tracks.filter((track) => track.localFile);
        tracks = [...previousTracks, ...newTracks];
        invalidateLibraryCaches();
        importedFolderStructures.push(buildImportedFolderStructure(folderStructureId, folderName, newTracks));
        activeFolderSelection = null;
        playbackTrackIndices = tracks.map((track, index) => index);
        setActiveNavigationView("library");
        activeTrack = previousTracks.length;
        if (activeLibraryCategory === "Folders") activeLibraryCategory = "Songs";
        updateMobileNavigation();
        document.getElementById("search").value = "";
        renderPlaylist(folderName);
        setTrack(activeTrack, false);
        void persistPlaylist();
        showToast(`${newTracks.length} audio ${newTracks.length === 1 ? "file" : "files"} loaded. Ready to play.`);
        void readTrackDetails(newTracks, generation);
      } catch (error) {
        console.error("Android folder import failed:", error);
        showToast("Unable to import audio from the selected folder.");
      }
      return true;
    }

    async function openFolderImport() {
      if (!await importAndroidFolder()) folderInput.click();
    }

    function renderEqBands() {
      const container = document.getElementById("eq-bands");
      container.replaceChildren();
      eqBands.forEach((band, index) => {
        const bandElement = document.createElement("div");
        bandElement.className = "eq-band";
        bandElement.innerHTML = `<span class="eq-band-value"></span><span class="eq-range-wrap"><input class="eq-range" type="range" min="-12" max="12" step=".1" aria-label="${band.frequency} hertz gain" data-band="${index}"></span><span class="eq-band-frequency">${band.label}</span>`;
        const range = bandElement.querySelector(".eq-range");
        range.value = eqValues[index];
        range.addEventListener("input", () => {
          eqValues[index] = Number(range.value);
          eqBaseValues[index] = eqValues[index];
          eqActivePreset = "Custom";
          eqPresetPill = null;
          updateEqDisplay();
          applyEqValues();
          scheduleEqSettingsSave();
        });
        range.addEventListener("change", persistEqSettings);
        range.addEventListener("dblclick", () => {
          eqValues[index] = 0;
          eqBaseValues[index] = 0;
          range.value = "0";
          eqActivePreset = "Custom";
          eqPresetPill = null;
          updateEqDisplay();
          applyEqValues();
          persistEqSettings();
        });
        container.appendChild(bandElement);
      });
      updateEqDisplay();
    }

    function renderEqPresets() {
      const container = document.getElementById("eq-presets");
      container.replaceChildren();
      eqPresets.forEach((preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "eq-preset";
        button.dataset.preset = preset.name;
        button.setAttribute("aria-pressed", "false");
        button.textContent = preset.name === "Studio Master" ? "★ Studio Master" : preset.name;
        button.addEventListener("click", () => selectEqPreset(preset.name));
        container.appendChild(button);
      });
      updatePresetSelection();
    }

    function selectEqPreset(name) {
      const preset = eqPresets.find((item) => item.name === name);
      if (!preset) return;
      eqActivePreset = name;
      eqPresetPill = name;
      eqResetPreset = name;
      eqResetPill = name;
      eqBaseValues = [...preset.values];
      eqResetValues = [...preset.values];
      updateEqValuesFromBase();
      persistEqSettings();
    }

    function updateEqValuesFromBase() {
      eqValues = [...eqBaseValues];
      updateEqDisplay();
      applyEqValues();
    }

    function updateEqDisplay() {
      document.querySelectorAll(".eq-band").forEach((bandElement, index) => {
        const value = eqValues[index];
        const range = bandElement.querySelector(".eq-range");
        const valueElement = bandElement.querySelector(".eq-band-value");
        const formatted = `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
        const percentage = ((value + 12) / 24) * 100;
        const color = value < 0 ? "#2dafff" : "#f2f2f2";
        bandElement.classList.toggle("negative", value < 0);
        range.value = String(value);
        range.style.setProperty("--range-color", color);
        range.style.setProperty("--range-start", `${Math.min(percentage, 50)}%`);
        range.style.setProperty("--range-end", `${Math.max(percentage, 50)}%`);
        range.setAttribute("aria-valuetext", `${formatted} dB`);
        valueElement.textContent = formatted;
      });
      document.getElementById("eq-active-preset").textContent = `${activeClarityProfile} + ${eqActivePreset}`;
      updateEqCurve();
      updatePresetSelection();
    }

    function updatePresetSelection() {
      document.querySelectorAll(".eq-preset").forEach((button) => {
        const selected = button.dataset.preset === eqPresetPill;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    }

    function updateEqCurve() {
      const points = eqValues.map((value, index) => ({
        x: 15 + index * (870 / (eqValues.length - 1)),
        y: 34 - Math.max(-6, Math.min(6, value)) * 4
      }));
      let line = `M ${points[0].x} ${points[0].y}`;
      for (let index = 0; index < points.length - 1; index++) {
        const previous = points[Math.max(0, index - 1)];
        const current = points[index];
        const next = points[index + 1];
        const after = points[Math.min(points.length - 1, index + 2)];
        const control1 = {
          x: current.x + (next.x - previous.x) / 6,
          y: current.y + (next.y - previous.y) / 6
        };
        const control2 = {
          x: next.x - (after.x - current.x) / 6,
          y: next.y - (after.y - current.y) / 6
        };
        line += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
      }
      document.getElementById("eq-curve-line").setAttribute("d", line);
      document.getElementById("eq-curve-fill").setAttribute("d", `${line} L 885 65 L 15 65 Z`);

      const nodes = document.getElementById("eq-curve-nodes");
      nodes.replaceChildren();
      points.forEach((point) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("class", "eq-curve-node");
        circle.setAttribute("cx", String(point.x));
        circle.setAttribute("cy", String(point.y));
        circle.setAttribute("r", "2.5");
        nodes.appendChild(circle);
      });
    }

    function applyEqValues() {
      if (!audioContext || !eqFilters.length) return;
      eqFilters.forEach((filter, index) => {
        const gain = eqEnabled ? eqValues[index] + (clarityEnabled ? clarityCurve[index] : 0) : 0;
        filter.gain.setTargetAtTime(gain, audioContext.currentTime, .015);
      });
      applyClarityProfile();
    }

    function applyClarityProfile() {
      if (!audioContext || !clarityFilters.length) return;
      const profile = clarityProfiles[activeClarityProfile];
      const gains = [profile.subBass, profile.presence, profile.air, profile.exciter];
      clarityFilters.forEach((filter, index) => {
        filter.gain.setTargetAtTime(eqEnabled && clarityEnabled ? gains[index] : 0, audioContext.currentTime, .015);
      });
    }

    function setEqEnabled(enabled) {
      eqEnabled = enabled;
      const toggle = document.getElementById("eq-toggle");
      toggle.classList.toggle("is-on", enabled);
      toggle.setAttribute("aria-checked", String(enabled));
      applyEqValues();
    }

    function setClarityEnabled(enabled) {
      clarityEnabled = enabled;
      const toggle = document.getElementById("clarity-toggle");
      toggle.classList.toggle("is-on", enabled);
      toggle.setAttribute("aria-checked", String(enabled));
      applyEqValues();
    }

    function setClarityProfile(name, persist = true) {
      if (!Object.prototype.hasOwnProperty.call(clarityProfiles, name)) return;
      activeClarityProfile = name;
      document.querySelectorAll(".clarity-profile-card").forEach((card) => {
        const selected = card.dataset.profile === name;
        card.classList.toggle("selected", selected);
        card.setAttribute("aria-checked", String(selected));
      });
      applyClarityProfile();
      updateEqDisplay();
      if (persist) persistEqSettings();
    }

    function setEqualizerTab(tab) {
      const bandsActive = tab === "bands";
      const bandsTab = document.getElementById("eq-tab-bands");
      const clarityTab = document.getElementById("eq-tab-clarity");
      bandsTab.classList.toggle("active", bandsActive);
      bandsTab.setAttribute("aria-selected", String(bandsActive));
      clarityTab.classList.toggle("active", !bandsActive);
      clarityTab.setAttribute("aria-selected", String(!bandsActive));
      document.getElementById("eq-band-view").hidden = !bandsActive;
      document.getElementById("eq-clarity-view").hidden = bandsActive;
    }

    function resetEqToPreset() {
      eqActivePreset = eqResetPreset;
      eqPresetPill = eqResetPill;
      eqBaseValues = [...eqResetValues];
      updateEqValuesFromBase();
      persistEqSettings();
    }

    function setupEqualizer() {
      renderEqPresets();
      renderEqBands();
      setEqEnabled(eqEnabled);
      setClarityEnabled(clarityEnabled);
      setClarityProfile(activeClarityProfile, false);

      document.getElementById("eq-toggle").addEventListener("click", () => updateSetting("equalizerEnabled", !eqEnabled));
      document.getElementById("clarity-toggle").addEventListener("click", () => updateSetting("clarityEnabled", !clarityEnabled));
      document.getElementById("eq-reset").addEventListener("click", resetEqToPreset);
      document.getElementById("eq-tab-bands").addEventListener("click", () => setEqualizerTab("bands"));
      document.getElementById("eq-tab-clarity").addEventListener("click", () => setEqualizerTab("clarity"));
      document.getElementById("clarity-profiles").addEventListener("click", (event) => {
        const profile = event.target.closest("[data-profile]");
        if (profile) setClarityProfile(profile.dataset.profile);
      });
      document.querySelector(".eq-utility-buttons").addEventListener("click", (event) => {
        const button = event.target.closest("[data-utility]");
        if (!button) return;
        const utility = button.dataset.utility;
        const values = utility === "flat"
          ? eqPresets[0].values
          : utility === "bass"
            ? [2, 2, 2, 2, 0, 0, 0, 0, 0, 0]
            : [0, 0, 0, 0, 0, 0, 2, 2, 2, 2];
        eqActivePreset = utility === "flat" ? "Default" : button.textContent;
        eqPresetPill = utility === "flat" ? "Default" : null;
        eqResetPreset = eqActivePreset;
        eqResetPill = eqPresetPill;
        eqBaseValues = [...values];
        eqResetValues = [...values];
        updateEqValuesFromBase();
        persistEqSettings();
      });
    }

    function connectAudio() {
      if (audioSource || (isAndroidPlatform && settingsState.androidDirectPlayback)) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        showToast("Web Audio API is not supported in this browser.");
        return;
      }
      audioContext = new AudioContextClass();
      outputGain = audioContext.createGain();
      audioSource = audioContext.createMediaElementSource(audio);
      eqFilters = eqBands.map((band) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = band.frequency;
        filter.Q.value = 1;
        return filter;
      });
      const clarityFilterSpecs = [
        { type: "lowshelf", frequency: 60, q: .707 },
        { type: "peaking", frequency: 3000, q: 1 },
        { type: "highshelf", frequency: 12000, q: .707 },
        { type: "peaking", frequency: 8000, q: 1.2 }
      ];
      clarityFilters = clarityFilterSpecs.map((spec) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = spec.type;
        filter.frequency.value = spec.frequency;
        filter.Q.value = spec.q;
        return filter;
      });
      const filterChain = [...eqFilters, ...clarityFilters];
      audioSource.connect(filterChain[0]);
      filterChain.forEach((filter, index) => {
        filter.connect(index < filterChain.length - 1 ? filterChain[index + 1] : outputGain);
      });
      outputGain.connect(audioContext.destination);
      applyEqValues();
    }

    playButton.addEventListener("click", () => {
      connectAudio();
      if (audioContext && audioContext.state === "suspended") audioContext.resume();
      togglePlayback();
    });
    document.getElementById("previous").addEventListener("click", () => stepTrack(-1));
    document.getElementById("next").addEventListener("click", () => {
      stepTrack(1);
    });
    document.getElementById("shuffle").addEventListener("click", () => {
      toggleShuffle();
    });
    document.getElementById("repeat").addEventListener("click", (event) => {
      const modes = ["off", "all", "one"];
      repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
      updateRepeatButton();
      showToast(repeatMode === "off" ? "Repeat is off" : `Repeat ${repeatMode} is on`);
    });
    document.getElementById("player-like").addEventListener("click", () => toggleTrackFavorite(activeTrack));
    document.getElementById("now-playing-play").addEventListener("click", () => togglePlayback());
    document.getElementById("now-playing-previous").addEventListener("click", () => stepTrack(-1));
    document.getElementById("now-playing-next").addEventListener("click", () => stepTrack(1));
    document.getElementById("now-playing-shuffle").addEventListener("click", () => {
      toggleShuffle();
    });
    document.getElementById("now-playing-repeat").addEventListener("click", () => {
      const modes = ["off", "all", "one"];
      repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
      updateRepeatButton();
      showToast(repeatMode === "off" ? "Repeat is off" : `Repeat ${repeatMode} is on`);
    });
    document.getElementById("now-playing-like").addEventListener("click", () => toggleTrackFavorite(activeTrack));
    document.getElementById("now-playing-output").addEventListener("click", () => {
      audio.muted = !audio.muted;
      updateAudioOutputButton();
    });
    document.getElementById("now-playing-video").addEventListener("click", () => {
      showToast("Video mode is unavailable for audio tracks.");
    });
    document.getElementById("now-playing-menu").addEventListener("click", openSettingsView);
    document.getElementById("now-playing-lyrics-toggle").addEventListener("click", (event) => {
      const button = event.currentTarget;
      const panel = document.getElementById("now-playing-lyrics");
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-pressed", String(!panel.hidden));
      button.setAttribute("aria-label", panel.hidden ? "Show lyrics" : "Hide lyrics");
      button.title = panel.hidden ? "Show lyrics" : "Hide lyrics";
    });
    updateShuffleButton();
    updateRepeatButton();
    document.getElementById("volume").value = String(settingsState.defaultVolume);
    document.getElementById("volume").addEventListener("input", (event) => {
      audio.volume = Number(event.target.value);
      if (settingsState.rememberVolume) {
        settingsState.defaultVolume = audio.volume;
        persistSettings();
      }
    });
    audio.volume = settingsState.defaultVolume;
    updateAudioOutputButton();
    document.getElementById("open-folder").addEventListener("click", () => void openFolderImport());
    document.getElementById("import-shortcut").addEventListener("click", () => songInput.click());
    document.getElementById("import-folder-shortcut").addEventListener("click", () => void openFolderImport());
    categoryNavigation.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      closeSettingsView();
      closeNowPlaying();
      const librarySection = document.getElementById("library-section");
      setActiveNavigationView("library");
      activeLibraryCategory = button.dataset.category;
      playbackTrackIndices = tracks.map((track, index) => index);
      activeFolderSelection = null;
      updateMobileNavigation();
      document.getElementById("search").value = "";
      document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderLibraryCategories();
      renderTrackList();
      renderSearchResults();
      renderQueue();
      renderPlaylistHeading(libraryFolderName);
      const libraryRect = librarySection.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const libraryIsNearTop = libraryRect.top >= stageRect.top - 10 &&
        libraryRect.top <= stageRect.top + 180;
      if (!libraryIsNearTop) {
        stage.scrollTop = Math.max(0, stage.scrollTop + libraryRect.top - stageRect.top - 90);
      }
      void persistPlaylist();
    });
    document.getElementById("featured-play").addEventListener("click", playHomeRadio);
    document.getElementById("featured-art").addEventListener("click", playHomeRadio);
    document.getElementById("featured-title").addEventListener("click", playHomeRadio);
    document.getElementById("featured-title").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        playHomeRadio();
      }
    });
    document.getElementById("mood-filter-row").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mood]");
      if (!button) return;
      activeMoodFilter = button.dataset.mood;
      document.querySelectorAll(".mood-chip").forEach((chip) => {
        const selected = chip === button;
        chip.classList.toggle("selected", selected);
        chip.setAttribute("aria-pressed", String(selected));
      });
      renderHomeSections();
    });
    document.querySelector(".quick-access-row").addEventListener("click", (event) => {
      const button = event.target.closest("[data-quick-access]");
      if (!button) return;
      if (button.dataset.quickAccess === "liked") {
        const likedSongsButton = categoryNavigation.querySelector('[data-category="Liked Songs"]');
        if (likedSongsButton) likedSongsButton.click();
      } else if (button.dataset.quickAccess === "youtube-liked") {
        window.open("https://music.youtube.com/playlist?list=LM", "_blank", "noopener,noreferrer");
      } else if (button.dataset.quickAccess === "discover") {
        document.getElementById("discover-section").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    document.querySelector(".genre-chip-row").addEventListener("click", (event) => {
      const button = event.target.closest("[data-genre]");
      if (button) playGenreRadio(button.dataset.genre);
    });
    document.getElementById("player-track-open").addEventListener("click", openNowPlaying);
    document.getElementById("quick-picks").addEventListener("click", (event) => {
      const button = event.target.closest("[data-track]");
      if (button) playTrackFromCard(Number(button.dataset.track));
    });
    document.getElementById("listen-again").addEventListener("click", (event) => {
      const button = event.target.closest("[data-track]");
      if (button) playTrackFromCard(Number(button.dataset.track));
    });
    document.getElementById("search-results-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-track]");
      if (button) playTrackFromCard(Number(button.dataset.track));
    });
    document.getElementById("listen-see-all").addEventListener("click", () => {
      document.querySelector('.sidebar [data-view="playlists"]').click();
    });
    folderInput.addEventListener("change", (event) => {
      const selectedFiles = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = "";
      importAudioFiles(selectedFiles);
    });
    songInput.addEventListener("change", (event) => {
      const selectedFiles = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = "";
      importAudioFiles(selectedFiles);
    });
    seek.addEventListener("input", () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) / 1000 * audio.duration;
    });
    nowPlayingSeek.addEventListener("input", () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Number(nowPlayingSeek.value) / 1000 * audio.duration;
    });
    audio.addEventListener("loadedmetadata", () => {
      duration.textContent = formatTime(audio.duration);
      const currentTrack = tracks[activeTrack];
      if (currentTrack) {
        currentTrack.time = formatTime(audio.duration).replace(/^0/, "");
        updateNowPlayingAudioQuality(currentTrack);
        const currentDuration = list.querySelector(`.track[data-track="${activeTrack}"] .track-time`);
        if (currentDuration) currentDuration.textContent = currentTrack.time;
      }
      updateNowPlayingProgress();
      updateMediaSessionPositionState();
    });
    audio.addEventListener("timeupdate", () => {
      scheduleTimedMixFadeOut();
      elapsed.textContent = formatTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const progress = audio.currentTime / audio.duration * 100;
        seek.value = String(Math.round(progress * 10));
        setSeekFill(progress);
      }
      updateNowPlayingProgress();
      updateSyncedLyrics();
      updateMediaSessionPositionState();
      void maybeScrobbleCurrentTrack();
    });
    audio.addEventListener("play", () => {
      if (!lastFmTrackStartedAt) lastFmTrackStartedAt = Math.floor(Date.now() / 1000);
      updatePlayState();
      void updateLastFmNowPlaying();
    });
    audio.addEventListener("pause", updatePlayState);
    audio.addEventListener("durationchange", updateMediaSessionPositionState);
    audio.addEventListener("ratechange", updateMediaSessionPositionState);
    audio.addEventListener("ended", () => {
      updatePlayState();
      if (repeatMode === "one") {
        if (!audio.loop) {
          audio.currentTime = 0;
          void togglePlayback();
        }
        return;
      }
      if (repeatMode === "all") {
        stepTrack(1);
        return;
      }
      if (!settingsState.autoplayNext) return;
      if (shuffleOn) {
        if (shuffleQueue.length) stepTrack(1);
        return;
      }
      const currentPosition = playbackTrackIndices.indexOf(activeTrack);
      if (currentPosition >= 0 && currentPosition < playbackTrackIndices.length - 1) {
        setTrack(playbackTrackIndices[currentPosition + 1], true);
      }
    });
    list.addEventListener("click", (event) => {
      const folderButton = event.target.closest("[data-folder]");
      if (folderButton) {
        activeFolderSelection = folderButton.dataset.folder;
        playbackTrackIndices = tracks.reduce((indices, track, index) => {
          if ((track.folder || "Unsorted") === activeFolderSelection) indices.push(index);
          return indices;
        }, []);
        document.getElementById("search").value = "";
        renderTrackList();
        renderSearchResults();
        renderQueue();
        renderPlaylistHeading(libraryFolderName);
        setTrack(playbackTrackIndices[0], true);
        void persistPlaylist();
        return;
      }
      if (event.target.closest("[data-folder-back]")) {
        activeFolderSelection = null;
        playbackTrackIndices = tracks.map((track, index) => index);
        renderTrackList();
        renderQueue();
        renderPlaylistHeading(libraryFolderName);
        void persistPlaylist();
        return;
      }
      const button = event.target.closest(".track");
      if (!button) return;
      const index = Number(button.dataset.track);
      playTrackFromCard(index);
    });
    document.querySelector(".queue").addEventListener("click", (event) => {
      const button = event.target.closest(".queue-cover");
      if (button) playTrackFromCard(Number(button.dataset.track));
    });
    const topbar = document.querySelector(".topbar");
    document.getElementById("mobile-search-toggle").addEventListener("click", () => {
      const isSearchOpen = topbar.classList.toggle("search-open");
      if (isSearchOpen) document.getElementById("search").focus();
    });
    document.getElementById("profile-settings").addEventListener("click", openSettingsView);
    document.getElementById("search").addEventListener("input", (event) => {
      if (!event.currentTarget.value.trim()) renderTrackList();
      renderSearchResults();
    });
    document.getElementById("now-playing-back").addEventListener("click", closeNowPlaying);
    document.getElementById("settings-close").addEventListener("click", closeSettingsView);
    document.getElementById("settings-categories").addEventListener("click", (event) => {
      const button = event.target.closest("[data-settings-category]");
      if (!button) return;
      activeSettingsCategory = button.dataset.settingsCategory;
      document.getElementById("settings-search").value = "";
      renderSettingsView();
    });
    document.getElementById("settings-search").addEventListener("input", renderSettingsView);
    document.getElementById("settings-content").addEventListener("change", (event) => {
      const control = event.target.closest("[data-setting]");
      if (control) {
        updateSetting(control.dataset.setting, control.type === "checkbox"
          ? control.checked
          : control.type === "range" ? Number(control.value) : control.value);
        return;
      }
      const backendUrl = event.target.closest("[data-backend-url]");
      if (backendUrl) {
        settingsState.integrationsBackendUrl = backendUrl.value.trim().replace(/\/+$/, "");
        lastFmBackendStatus.checked = false;
        persistSettings();
        return;
      }
      const youtubeClientId = event.target.closest("[data-youtube-client-id]");
      if (youtubeClientId) {
        settingsState.youtubeOAuthClientId = youtubeClientId.value.trim();
        persistSettings();
      }
    });
    document.getElementById("settings-content").addEventListener("input", (event) => {
      const control = event.target.closest('[data-setting][type="range"], [data-custom-accent]');
      if (!control) return;
      if (control.matches("[data-custom-accent]")) {
        settingsState.customAccentColor = control.value;
        updateSetting("accentColor", control.value);
      } else {
        updateSetting(control.dataset.setting, Number(control.value));
      }
    });
    document.getElementById("settings-content").addEventListener("click", async (event) => {
      const accent = event.target.closest("[data-accent]");
      if (accent) {
        updateSetting("accentColor", accent.dataset.accent);
        return;
      }
      const choice = event.target.closest("[data-choice-key]");
      if (choice) {
        const key = choice.dataset.choiceKey;
        const value = choice.dataset.choiceValue;
        if (key === "theme" && value === "Pearl") updateSetting("accentColor", "#3ea6ff");
        updateSetting(key, value);
        document.querySelectorAll(`[data-choice-key="${key}"]`).forEach((button) => {
          const selected = button.dataset.choiceValue === value;
          button.classList.toggle("selected", selected);
          button.setAttribute("aria-pressed", String(selected));
        });
        return;
      }
      const action = event.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "export-backup") {
        let playlist = null;
        try {
          playlist = JSON.parse(localStorage.getItem(playlistStorageKey) || "null");
        } catch (error) {
          console.error("Playlist metadata could not be included in backup:", error);
          showToast("Unable to read playlist metadata for backup.");
          return;
        }
        downloadJson("musicheaven-backup.json", {
          app: "MusicHeaven",
          version: 1,
          exportedAt: new Date().toISOString(),
          settings: {
            ...settingsState,
            lastFmSessionKey: "",
            lastFmUsername: "",
            lastFmScrobbling: false,
            youtubeConnected: false
          },
          playlist
        });
        logDiagnostic("Backup exported");
        showToast("Backup exported. Audio files are not included.");
      } else if (action.dataset.action === "import-backup") {
        document.getElementById("backup-input").click();
      } else if (action.dataset.action === "clear-cache") {
        await clearCachedData();
      } else if (action.dataset.action === "export-diagnostics") {
        downloadJson("musicheaven-diagnostics.json", {
          app: "MusicHeaven",
          exportedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          verboseLogging: Boolean(settingsState.verboseLogging),
          events: diagnosticLogs
        });
        showToast("Diagnostic logs exported.");
      } else if (action.dataset.action === "check-updates") {
        await checkForAppUpdate(action);
      } else if (action.dataset.action === "choose-download-location") {
        if (typeof window.showDirectoryPicker !== "function") {
          showToast("Folder selection is not supported by this browser.");
          return;
        }
        try {
          downloadDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
          updateSetting("downloadLocation", downloadDirectoryHandle.name || "Selected folder");
        } catch (error) {
          if (error.name !== "AbortError") {
            console.error("Download folder could not be selected:", error);
            showToast("Unable to select the download folder.");
          }
        }
      } else if (action.dataset.action === "reorganize-downloads") {
        await reorganizeDownloads();
      } else if (action.dataset.action === "youtube-sync") {
        await syncYouTubeLibrary(action);
      } else if (action.dataset.action === "youtube-connect") {
        if (youtubeAccessToken) {
          youtubeAccessToken = "";
          settingsState.youtubeConnected = false;
          renderSettingsView();
          showToast("YouTube disconnected from this browser session.");
        } else {
          await connectYouTube();
        }
      } else if (action.dataset.action === "spotify-login") {
        showToast("Spotify cookie login is not available in the browser-only build.");
      } else if (action.dataset.action === "lastfm-save") {
        await saveLastFmCredentials();
      } else if (action.dataset.action === "lastfm-connect") {
        if (lastFmAuthToken) await verifyLastFmAuthorization();
        else await connectLastFm();
      } else if (action.dataset.action === "lastfm-signout") {
        settingsState.lastFmSessionKey = "";
        settingsState.lastFmUsername = "";
        settingsState.lastFmScrobbling = false;
        lastFmAuthToken = "";
        persistSettings();
        renderSettingsView();
        showToast("Last.fm account signed out.");
      } else if (action.dataset.action === "lastfm-clear") {
        settingsState.lastFmApiKey = "";
        settingsState.lastFmSessionKey = "";
        settingsState.lastFmUsername = "";
        settingsState.lastFmScrobbling = false;
        lastFmAuthToken = "";
        persistSettings();
        renderSettingsView();
        showToast("Last.fm API key and account session cleared from this device.");
      } else if (action.dataset.action === "add-addon") {
        const value = window.prompt("Paste the full add-on URL:");
        if (!value) return;
        try {
          const url = new URL(value.trim());
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("URL must use http or https.");
          if (settingsState.addonSources.includes(url.href)) {
            showToast("That add-on URL is already in your list.");
            return;
          }
          settingsState.addonSources.push(url.href);
          persistSettings();
          renderSettingsView();
          showToast("Add-on URL saved. This build does not execute add-on sources.");
        } catch (error) {
          showToast(error.message || "Enter a valid add-on URL.");
        }
      } else if (action.dataset.action === "remove-addon") {
        settingsState.addonSources.splice(Number(action.dataset.addonIndex), 1);
        persistSettings();
        renderSettingsView();
      } else if (action.dataset.action === "hide-track") {
        const select = action.parentElement.querySelector(".setting-list-select");
        if (select && select.value) {
          settingsState.hiddenTrackIds.push(select.value);
          persistSettings();
          renderHomeSections();
          renderSettingsView();
        }
      } else if (action.dataset.action === "restore-track") {
        settingsState.hiddenTrackIds = settingsState.hiddenTrackIds.filter((id) => id !== action.dataset.trackId);
        persistSettings();
        renderHomeSections();
        renderSettingsView();
      }
    });
    document.getElementById("backup-input").addEventListener("change", (event) => {
      const file = event.currentTarget.files && event.currentTarget.files[0];
      event.currentTarget.value = "";
      void importBackup(file);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && !settingsState.backgroundPlayback) audio.pause();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!settingsView.hidden) closeSettingsView();
      if (nowPlayingOverlay.classList.contains("open")) closeNowPlaying();
    });
    document.getElementById("playlist-add").addEventListener("click", () => {
      songInput.click();
    });
    document.getElementById("queue-add").addEventListener("click", () => showToast("Track added to your queue."));
    document.querySelectorAll(".nav-button").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.category) return;
        document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        if (button.dataset.view === "settings") openSettingsView();
        else if (button.dataset.view === "home") {
          closeSettingsView();
          closeNowPlaying();
          setActiveNavigationView("home");
          if (activeFolderSelection) playbackTrackIndices = tracks.map((track, index) => index);
          activeFolderSelection = null;
          activeLibraryCategory = "Songs";
          playbackTrackIndices = tracks.map((track, index) => index);
          updateMobileNavigation();
          document.getElementById("search").value = "";
          renderSearchResults();
          renderTrackList();
          renderLibraryCategories();
          stage.scrollTop = 0;
          stage.scrollTo({ top: 0, behavior: "smooth" });
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (button.dataset.view === "playlists") {
          closeSettingsView();
          closeNowPlaying();
          setActiveNavigationView("playlists");
          activeLibraryCategory = "Songs";
          updateMobileNavigation();
          activeFolderSelection = null;
          playbackTrackIndices = tracks.map((track, index) => index);
          renderLibraryCategories();
          document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          renderTrackList();
          renderQueue();
          renderPlaylistHeading(libraryFolderName);
          document.getElementById("library-section").scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    document.getElementById("mobile-bottom-nav").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mobile-tab]");
      if (!button) return;
      if (button.dataset.mobileTab === "home") {
        document.querySelector('.sidebar [data-view="home"]').click();
        return;
      }
      const category = button.dataset.mobileTab === "folder" ? "Folders" : "Songs";
      let categoryButton = categoryNavigation.querySelector(`[data-category="${category}"]`);
      if (!categoryButton) {
        renderLibraryCategories();
        categoryButton = categoryNavigation.querySelector(`[data-category="${category}"]`);
      }
      if (categoryButton) categoryButton.click();
    });

    stage.addEventListener("scroll", () => {
      if (!window.matchMedia("(max-width: 780px)").matches || activeNavigationView !== "home") {
        document.body.classList.remove("mobile-dock-collapsed");
        lastMobileScrollTop = stage.scrollTop;
        return;
      }
      const currentScrollTop = stage.scrollTop;
      if (currentScrollTop <= 24 || currentScrollTop < lastMobileScrollTop - 2) {
        document.body.classList.remove("mobile-dock-collapsed");
      } else if (currentScrollTop > lastMobileScrollTop + 2) {
        document.body.classList.add("mobile-dock-collapsed");
      }
      lastMobileScrollTop = currentScrollTop;
    }, { passive: true });

    setupEqualizer();
    applyAppearanceSettings();
    updateGreeting();
    updateMobileNavigation();
    document.body.classList.toggle("compact-library", settingsState.compactLibrary);
    document.body.classList.toggle("hide-library-metadata", !settingsState.showMetadata);
    logDiagnostic("Application initialized");
    setupMediaSession();
    setTrack(0, false);
    void restorePlaylist();
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) importedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    });

// --- Auto Update Checker ---
const CURRENT_APP_VERSION = "1.1.0";
const RELEASES_API_URL = "https://api.github.com/repos/shimulsarker/MusicHeaven/releases/latest";

function compareVersionStrings(left, right) {
  const leftParts = String(left).replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}

async function checkForAppUpdate(button) {
  const status = document.getElementById("update-check-status");
  const originalLabel = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Checking…";
  }
  if (status) status.textContent = "Checking GitHub Releases…";
  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (response.status === 404) {
      if (status) status.textContent = "No MusicHeaven release has been published yet.";
      showToast("No published MusicHeaven release was found.");
      return;
    }
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
    const release = await response.json();
    const latestVersion = release.tag_name || release.name;
    if (!latestVersion) throw new Error("The latest release has no version tag.");
    if (compareVersionStrings(latestVersion, CURRENT_APP_VERSION) > 0) {
      if (status) status.textContent = `MusicHeaven ${latestVersion} is available.`;
      showToast(`MusicHeaven ${latestVersion} is available.`);
      if (window.confirm(`MusicHeaven ${latestVersion} is available. Open the release page?`)) {
        window.open(release.html_url || "https://github.com/shimulsarker/MusicHeaven/releases", "_blank", "noopener");
      }
    } else {
      if (status) status.textContent = `You are using the latest version (v${CURRENT_APP_VERSION}).`;
      showToast("MusicHeaven is up to date.");
    }
  } catch (error) {
    console.error("MusicHeaven update check failed:", error);
    if (status) status.textContent = "Unable to check for updates. Check your internet connection and try again.";
    showToast(error.message || "Unable to check for updates.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}
