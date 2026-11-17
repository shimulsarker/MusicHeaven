    const audio = document.getElementById("audio");
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
    let analyser;
    let frequencyData;
    let audioSource;
    let eqFilters = [];
    let eqSaveTimer;
    let importGeneration = 0;
    let importedObjectUrls = [];
    const playlistStorageKey = "musicHeaven.playlist.v1";
    const settingsStorageKey = "musicHeaven.settings.v1";
    const defaultEqValues = [2.7, 2.2, 0.6, -2.6, -0.6, 1.2, 3, 4, 4.3, 4.8];
    const eqPresetNames = [
      "Default", "Studio Master", "Vocal Clarity", "Deep Bass Clean", "Bass Boost",
      "Warm", "Bright", "Late Night", "Rock", "Pop", "Electronic", "R&B"
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
      defaultVolume: .72
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
    ["backgroundPlayback", "autoplayNext", "rememberVolume", "equalizerEnabled", "clarityEnabled",
      "compactLibrary", "showMetadata", "highlightLyrics", "verboseLogging"].forEach((key) => {
      if (typeof settingsState[key] !== "boolean") settingsState[key] = defaultSettings[key];
    });
    if (!["#3ea6ff", "#6ee7d8", "#c18cff"].includes(settingsState.accentColor)) {
      settingsState.accentColor = defaultSettings.accentColor;
    }
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
    let activeNavigationView = "home";

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
      { name: "R&B", values: [2.8, 2.2, .8, -.6, -.2, 1.4, 2, 1.3, .4, 1.1] }
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
    const eqOverlay = document.getElementById("eq-overlay");
    const eqNavButton = document.querySelector('.nav-button[aria-label="Equalizer"]');
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
      categoryNavigation.replaceChildren();
      libraryCategories.forEach((category) => {
        const button = document.createElement("button");
        button.type = "button";
        const selected = activeNavigationView === "library" && activeLibraryCategory === category;
        button.className = `library-category nav-button${selected ? " active" : ""}`;
        button.dataset.category = category;
        button.setAttribute("aria-label", category);
        button.setAttribute("aria-pressed", String(selected));
        button.textContent = category;
        categoryNavigation.appendChild(button);
      });
    }

    function renderHomeSections() {
      const featuredTrack = tracks[0];
      const featuredArt = document.getElementById("featured-art");
      featuredArt.className = `featured-art art-${1}`;
      setArtwork(featuredArt, featuredTrack);
      document.getElementById("featured-title").textContent = featuredTrack.title;
      document.getElementById("featured-artist").textContent = featuredTrack.artist;

      const quickPicks = document.getElementById("quick-picks");
      quickPicks.replaceChildren();
      tracks.slice(0, 9).forEach((track, index) => {
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
      tracks.forEach((track, index) => {
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
        button.append(art, title, artist);
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
      const sourceName = activeNavigationView === "library"
        ? activeFolderSelection
          ? track.folder || libraryFolderName || "Your Library"
          : activeLibraryCategory === "Songs" ? "All Songs" : activeLibraryCategory
        : activeNavigationView === "playlists" ? libraryFolderName || "Daily Mix" : "All Songs";
      document.getElementById("now-playing-source").textContent = sourceName;
      const art = document.getElementById("now-playing-art");
      setArtwork(art, track);
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

    function settingCard(category, title, description, control) {
      return { category, title, description, control };
    }

    function settingsCatalog() {
      const storageUse = formatBytes(localStorageUsage());
      return [
        settingCard("General", "Behaviour", "Choose how MusicHeaven behaves when you switch tabs. Browsers do not provide a system tray.", toggleControl("backgroundPlayback", "Continue playback in background", "If disabled, playback pauses when this tab is hidden.")),
        settingCard("General", "Backup", "Export playlists and app settings as JSON. Audio files stay in this browser's IndexedDB and are not included.", '<div class="setting-actions"><button type="button" class="setting-button primary" data-action="export-backup">Export backup</button><button type="button" class="setting-button" data-action="import-backup">Import backup</button></div>'),
        settingCard("General", "Cached data", `MusicHeaven uses about ${storageUse} of LocalStorage for playlist metadata and settings. Audio files are stored separately in IndexedDB.`, `<div class="setting-actions"><span class="storage-stat">${storageUse} local data</span><button type="button" class="setting-button danger" data-action="clear-cache">Clear cached data</button></div>`),
        settingCard("General", "Diagnostics", "Verbose logging adds app events to the local diagnostic export.", `${toggleControl("verboseLogging", "Verbose logging")}<div class="setting-actions"><button type="button" class="setting-button" data-action="export-diagnostics">Export diagnostic logs</button></div>`),

        settingCard("Playback", "Playback behaviour", "Control what happens when a track finishes or the tab is backgrounded.", `${toggleControl("autoplayNext", "Automatically play next track")}${toggleControl("backgroundPlayback", "Continue playback in background")}`),
        settingCard("Playback", "Volume", "Set the player volume and optionally remember it on this device.", `${toggleControl("rememberVolume", "Remember volume") }<label class="setting-range"><span>Default volume</span><input type="range" min="0" max="1" step=".01" value="${settingsState.defaultVolume}" data-setting="defaultVolume"></label>`),
        settingCard("Audio", "Sound processing", "Enable the built-in equalizer and Studio Clarity audio filters.", `${toggleControl("equalizerEnabled", "Equalizer")}${toggleControl("clarityEnabled", "Studio Clarity")}`),
        settingCard("Library", "Library display", "Adjust how imported songs and metadata are shown.", `${toggleControl("compactLibrary", "Compact song list")}${toggleControl("showMetadata", "Show artist and album details")}`),
        settingCard("Lyrics", "Lyrics display", "Highlight the currently active line when embedded timestamps are available.", toggleControl("highlightLyrics", "Highlight synced lyrics")),
        settingCard("Appearance", "Accent color", "Choose an accent color for controls and highlights.", `<div class="accent-options">${[["#3ea6ff", "Cyan blue"], ["#6ee7d8", "Mint"], ["#c18cff", "Violet"]].map(([color, name]) => `<button type="button" class="accent-option${settingsState.accentColor === color ? " selected" : ""}" data-accent="${color}" style="--option-color:${color}" aria-label="${name}" aria-pressed="${settingsState.accentColor === color}"></button>`).join("")}</div>`),
        settingCard("Downloads", "Local audio", "Imported audio is saved in this browser's IndexedDB for offline access. MusicHeaven does not fetch or download tracks from online services.", '<p class="setting-note">Use Import folder or Add songs in the sidebar to add files from this device.</p>'),
        settingCard("Last.fm", "Scrobbling", "Last.fm scrobbling is not connected in this local-only player.", '<p class="setting-note">No account credentials are stored or transmitted.</p>'),
        settingCard("Integrations", "Connected services", "There are no external services connected.", '<p class="setting-note">Your imported library stays on this device.</p>'),
        settingCard("Sources", "Music sources", "MusicHeaven currently plays audio files selected from your device.", '<p class="setting-note">Cloud streaming sources are not configured.</p>'),
        settingCard("Experimental", "Experimental features", "No experimental playback features are enabled.", '<p class="setting-note">Core library and playback features remain available.</p>'),
        settingCard("About", "MusicHeaven", "A local music player for your personal library.", '<p class="setting-note">Playlist metadata is stored in LocalStorage; imported audio is stored in IndexedDB.</p>')
      ];
    }

    function renderSettingsView() {
      const query = document.getElementById("settings-search").value.trim().toLowerCase();
      document.querySelectorAll(".settings-category").forEach((button) => {
        button.classList.toggle("active", button.dataset.settingsCategory === activeSettingsCategory && !query);
      });
      const catalog = settingsCatalog();
      const items = query
        ? catalog.filter((card) => `${card.category} ${card.title} ${card.description}`.toLowerCase().includes(query))
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
    }

    function openSettingsView() {
      closeNowPlaying();
      if (eqOverlay.classList.contains("open")) setEqOverlayOpen(false);
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

    function updateSetting(key, value) {
      settingsState[key] = value;
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
      if (key === "defaultVolume") {
        document.getElementById("volume").value = String(value);
        audio.volume = value;
      }
      persistSettings();
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
        if (!["#3ea6ff", "#6ee7d8", "#c18cff"].includes(importedSettings.accentColor)) {
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
      if (shuffleOn) shuffleQueue = shuffleQueue.filter((queuedIndex) => queuedIndex !== activeTrack);
      const track = tracks[activeTrack];
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

    function playTrackFromCard(index) {
      setTrack(index, true);
      openNowPlaying();
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
        folder: pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : "Selected files",
        folderStructureId,
        time: "--:--",
        src,
        file,
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
        const savedTracks = localTracks.map(({ id, title, artist, album, genre, folder, folderStructureId, time }) => ({
          id, title, artist, album, genre, folder, folderStructureId, time
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
          if (!storedAudio || !(storedAudio.blob instanceof Blob)) continue;
          const src = URL.createObjectURL(storedAudio.blob);
          restoredObjectUrls.push(src);
          restoredTracks.push({
            ...savedTrack,
            src,
            file: storedAudio.blob,
            localFile: true
          });
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
        showToast("No supported audio files were found in that folder.");
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
      activeNavigationView = "library";
      activeTrack = previousTracks.length;
      if (activeLibraryCategory === "Folders") activeLibraryCategory = "Songs";
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

    function setEqOverlayOpen(open) {
      eqOverlay.classList.toggle("open", open);
      eqOverlay.setAttribute("aria-hidden", String(!open));
      document.body.classList.toggle("eq-open", open);
      eqNavButton.setAttribute("aria-expanded", String(open));
      if (open) document.getElementById("eq-toggle").focus();
      else eqNavButton.focus();
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
      document.getElementById("eq-back").addEventListener("click", () => setEqOverlayOpen(false));
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
      eqOverlay.addEventListener("click", (event) => {
        if (event.target === eqOverlay) setEqOverlayOpen(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && eqOverlay.classList.contains("open")) setEqOverlayOpen(false);
      });
    }

    function setupVisualizer() {
      const bars = document.getElementById("wave-bars");
      for (let i = 0; i < 76; i++) {
        const bar = document.createElement("span");
        bar.className = "wave-bar";
        bar.style.height = `${5 + Math.random() * 20}px`;
        bars.appendChild(bar);
      }
    }

    function connectAudio() {
      if (audioSource) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        showToast("Web Audio API is not supported in this browser.");
        return;
      }
      audioContext = new AudioContextClass();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
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
        filter.connect(index < filterChain.length - 1 ? filterChain[index + 1] : analyser);
      });
      analyser.connect(audioContext.destination);
      applyEqValues();
    }

    function animateBars() {
      const elements = document.querySelectorAll(".wave-bar");
      if (analyser && !audio.paused) {
        analyser.getByteFrequencyData(frequencyData);
        elements.forEach((bar, i) => {
          const bin = Math.floor(i * frequencyData.length / elements.length);
          bar.style.height = `${Math.max(4, frequencyData[bin] * .38)}px`;
        });
      } else {
        const time = performance.now() / 360;
        elements.forEach((bar, i) => {
          const wave = Math.sin(i * .42 + time) * .5 + Math.sin(i * .15 - time * .8) * .3;
          bar.style.height = `${Math.max(4, 8 + (wave + .8) * 13)}px`;
        });
      }
      requestAnimationFrame(animateBars);
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
    document.getElementById("open-folder").addEventListener("click", () => folderInput.click());
    document.getElementById("import-shortcut").addEventListener("click", () => folderInput.click());
    categoryNavigation.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      closeSettingsView();
      closeNowPlaying();
      const librarySection = document.getElementById("library-section");
      activeNavigationView = "library";
      activeLibraryCategory = button.dataset.category;
      if (activeFolderSelection) playbackTrackIndices = tracks.map((track, index) => index);
      activeFolderSelection = null;
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
    document.getElementById("featured-play").addEventListener("click", () => playTrackFromCard(0));
    document.getElementById("featured-art").addEventListener("click", () => playTrackFromCard(0));
    document.getElementById("featured-title").addEventListener("click", () => playTrackFromCard(0));
    document.getElementById("featured-title").addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        playTrackFromCard(0);
      }
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
        const currentDuration = list.querySelector(`.track[data-track="${activeTrack}"] .track-time`);
        if (currentDuration) currentDuration.textContent = currentTrack.time;
      }
      updateNowPlayingProgress();
      updateMediaSessionPositionState();
    });
    audio.addEventListener("timeupdate", () => {
      elapsed.textContent = formatTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const progress = audio.currentTime / audio.duration * 100;
        seek.value = String(Math.round(progress * 10));
        setSeekFill(progress);
      }
      updateNowPlayingProgress();
      updateSyncedLyrics();
      updateMediaSessionPositionState();
    });
    audio.addEventListener("play", updatePlayState);
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
      if (!control) return;
      updateSetting(control.dataset.setting, control.type === "checkbox" ? control.checked : Number(control.value));
    });
    document.getElementById("settings-content").addEventListener("click", async (event) => {
      const accent = event.target.closest("[data-accent]");
      if (accent) {
        updateSetting("accentColor", accent.dataset.accent);
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
          settings: settingsState,
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
        if (button === eqNavButton) {
          closeSettingsView();
          closeNowPlaying();
          setEqOverlayOpen(!eqOverlay.classList.contains("open"));
        }
        else if (button.dataset.view === "settings") openSettingsView();
        else if (button.dataset.view === "home") {
          closeSettingsView();
          closeNowPlaying();
          activeNavigationView = "home";
          if (activeFolderSelection) playbackTrackIndices = tracks.map((track, index) => index);
          activeFolderSelection = null;
          activeLibraryCategory = "Songs";
          document.getElementById("search").value = "";
          renderSearchResults();
          renderTrackList();
          renderLibraryCategories();
          stage.scrollTop = 0;
          stage.scrollTo({ top: 0, behavior: "smooth" });
          window.scrollTo({ top: 0, behavior: "smooth" });
          if (eqOverlay.classList.contains("open")) setEqOverlayOpen(false);
        } else if (button.dataset.view === "playlists") {
          closeSettingsView();
          closeNowPlaying();
          activeNavigationView = "playlists";
          activeLibraryCategory = "Songs";
          activeFolderSelection = null;
          playbackTrackIndices = tracks.map((track, index) => index);
          renderLibraryCategories();
          document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
          button.classList.add("active");
          renderTrackList();
          renderQueue();
          renderPlaylistHeading(libraryFolderName);
          document.getElementById("library-section").scrollIntoView({ behavior: "smooth", block: "start" });
          if (eqOverlay.classList.contains("open")) setEqOverlayOpen(false);
        } else if (eqOverlay.classList.contains("open")) {
          closeSettingsView();
          closeNowPlaying();
          setEqOverlayOpen(false);
          button.focus();
        }
      });
    });

    setupEqualizer();
    setupVisualizer();
    document.documentElement.style.setProperty("--accent", settingsState.accentColor);
    document.body.classList.toggle("compact-library", settingsState.compactLibrary);
    document.body.classList.toggle("hide-library-metadata", !settingsState.showMetadata);
    logDiagnostic("Application initialized");
    animateBars();
    setupMediaSession();
    setTrack(0, false);
    void restorePlaylist();
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) importedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    });

// --- Auto Update Checker ---
const CURRENT_APP_VERSION = "1.0.0";
const GIST_RAW_URL = "YOUR_GIST_RAW_URL_HERE";

async function checkForAppUpdate() {
  try {
    const response = await fetch(`${GIST_RAW_URL}?t=${new Date().getTime()}`);
    const data = await response.json();

    if (data.latestVersion && data.latestVersion !== CURRENT_APP_VERSION) {
      const userConfirmed = window.confirm(
        `New update available (v${data.latestVersion})!\n\n${data.releaseNotes}\n\nDo you want to download it now?`
      );

      if (userConfirmed && data.apkUrl) {
        window.open(data.apkUrl, "_system");
      }
    }
  } catch (error) {
    console.error("Update check failed:", error);
  }
}

window.addEventListener("DOMContentLoaded", checkForAppUpdate);
