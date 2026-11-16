    const audio = document.getElementById("audio");
    const stage = document.getElementById("stage");
    const playButton = document.getElementById("play");
    const seek = document.getElementById("seek");
    const elapsed = document.getElementById("elapsed");
    const duration = document.getElementById("duration");
    let tracks = Array.from({ length: 11 }, (_, i) => ({
      title: i === 0 ? "Mon Majhi Re" : `Track ${String(i + 1).padStart(2, "0")}`,
      artist: i === 0 ? "Arijit Singh" : "Artist Name",
      time: i === 0 ? "4:30" : ["3:45", "4:12", "3:28", "5:06", "3:52", "4:21", "3:37", "4:48", "3:59", "4:16"][i - 1],
      src: i === 0 ? "Arijit_Singh__Mon_Majhi_Re__Full_HD_Video_Song___Boss_Bengali_Movie___Jeet___Sub.mp3" : ""
    }));
    let activeTrack = 0;
    let shuffleOn = false;
    let repeatOn = false;
    let toastTimer;
    let audioContext;
    let analyser;
    let frequencyData;
    let audioSource;
    let eqFilters = [];
    let importGeneration = 0;
    let importedObjectUrls = [];
    const playlistStorageKey = "musicHeaven.playlist.v1";
    const libraryCategories = ["Songs", "Artists", "Albums", "Genres", "Folders"];
    let activeLibraryCategory = "Songs";
    let libraryFolderName = "";
    let activeFolderSelection = null;
    let playbackTrackIndices = tracks.map((track, index) => index);
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
    let eqValues = eqBands.map((band) => band.value);
    let eqBaseValues = [...eqValues];
    let eqResetValues = [...eqValues];
    let eqActivePreset = "Studio Master";
    let eqPresetPill = "Studio Master";
    let eqResetPreset = "Studio Master";
    let eqResetPill = "Studio Master";
    let clarityEnabled = true;
    let activeClarityProfile = "Reference";
    let eqEnabled = true;
    let clarityFilters = [];
    const eqOverlay = document.getElementById("eq-overlay");
    const eqNavButton = document.querySelector('.nav-button[aria-label="Equalizer"]');

    const icon = (id) => `<svg><use href="#${id}"></use></svg>`;
    const list = document.getElementById("track-list");
    const folderInput = document.getElementById("folder-input");
    const songInput = document.getElementById("song-input");
    const categoryNavigation = document.querySelector(".library-categories");

    function groupTracksBy(category, trackIndices) {
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
      trackIndices.forEach((index) => {
        const track = tracks[index];
        const label = category === "Songs" ? "All songs" : (track[field] || fallbacks[category]);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push({ track, index });
      });
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

    function renderTrackList() {
      list.replaceChildren();
      renderHomeSections();
      const query = document.getElementById("search").value.trim().toLowerCase();
      if (activeLibraryCategory === "Folders" && !activeFolderSelection) {
        const folderGroups = groupTracksBy("Folders", tracks.map((track, index) => index));
        folderGroups.forEach((items, folderName) => {
          if (query && !folderName.toLowerCase().includes(query)) return;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "folder-entry";
          button.dataset.folder = folderName;
          button.innerHTML = `${icon("i-folder")}<span class="folder-entry-name"></span><span class="folder-entry-count"></span>`;
          button.querySelector(".folder-entry-name").textContent = folderName;
          button.querySelector(".folder-entry-count").textContent = `${items.length} ${items.length === 1 ? "song" : "songs"}`;
          list.appendChild(button);
        });
        return;
      }

      if (activeLibraryCategory === "Folders" && activeFolderSelection) {
        const backButton = document.createElement("button");
        backButton.type = "button";
        backButton.className = "folder-back";
        backButton.dataset.folderBack = "true";
        backButton.textContent = "← All folders";
        list.appendChild(backButton);
      }

      const visibleTrackIndices = activeLibraryCategory === "Folders"
        ? playbackTrackIndices
        : tracks.map((track, index) => index);
      const groups = groupTracksBy(activeLibraryCategory, visibleTrackIndices);
      groups.forEach((items, label) => {
        const heading = document.createElement("h3");
        heading.className = "library-group-heading";
        heading.textContent = label;
        list.appendChild(heading);
        items.forEach(({ track, index: i }) => {
          const button = document.createElement("button");
          button.className = `track${i === activeTrack ? " current" : ""}`;
          button.dataset.track = String(i);
          button.type = "button";
          button.hidden = query && !`${track.title} ${track.artist} ${track.album} ${track.genre} ${track.folder}`.toLowerCase().includes(query);
          const cover = document.createElement("span");
          cover.className = `cover cover-${i % 11 + 1}`;
          cover.setAttribute("aria-hidden", "true");
          if (track.localFile || i === 0) cover.innerHTML = icon("i-music");
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
          heart.className = "track-heart";
          heart.setAttribute("aria-hidden", "true");
          heart.innerHTML = icon("i-heart");
          const time = document.createElement("span");
          time.className = "track-time";
          time.textContent = track.time;
          button.append(cover, copy, heart, time);
          list.appendChild(button);
        });
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
      renderTrackList();
      renderQueue();
      renderPlaylistHeading(folderName);
    }

    renderPlaylist();

    function formatTime(seconds) {
      if (!Number.isFinite(seconds)) return "--:--";
      const mins = Math.floor(seconds / 60);
      return `${String(mins).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    }

    function updatePlayState() {
      const playing = !audio.paused;
      stage.classList.toggle("is-playing", playing);
      playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
      playButton.title = playing ? "Pause" : "Play";
      playButton.innerHTML = icon(playing ? "i-pause" : "i-play");
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
      const track = tracks[activeTrack];
      document.getElementById("current-title").textContent = track.title;
      document.getElementById("current-artist").textContent = track.artist;
      document.getElementById("player-art").className = `player-art art-${activeTrack % 8 + 1}`;
      document.querySelectorAll(".track").forEach((item) => item.classList.toggle("current", Number(item.dataset.track) === activeTrack));
      document.querySelectorAll(".queue-cover").forEach((item) => item.classList.toggle("active", Number(item.dataset.track) === activeTrack));
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
      if (autoplay) {
        if (track.src) togglePlayback();
        else showToast("Demo track—add an audio file to play it.");
      }
    }

    function stepTrack(direction) {
      if (!playbackTrackIndices.length) return;
      if (direction > 0 && shuffleOn) {
        setTrack(playbackTrackIndices[Math.floor(Math.random() * playbackTrackIndices.length)], true);
        return;
      }
      const currentPosition = playbackTrackIndices.indexOf(activeTrack);
      const nextPosition = (currentPosition + direction + playbackTrackIndices.length) % playbackTrackIndices.length;
      setTrack(playbackTrackIndices[nextPosition], true);
    }

    function setSeekFill(progress) {
      seek.style.background = `linear-gradient(90deg, #62eaff 0%, #a76bff ${progress}%, rgba(255,255,255,.13) ${progress}%)`;
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

    function readTrackMetadata(track, generation) {
      const reader = window.jsmediatags;
      if (!reader || typeof reader.read !== "function") {
        console.error("jsmediatags is unavailable; audio metadata could not be read.");
        showToast("Audio metadata reader is unavailable. Check your internet connection.");
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        let settled = false;
        const timeout = setTimeout(() => {
          console.warn(`Timed out reading ID3 metadata for "${track.title}".`);
          finish(null);
        }, 15000);
        const finish = (tags) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (generation === importGeneration && tags) {
            track.title = metadataText(tags.title) || track.title;
            track.artist = metadataText(tags.artist) || track.artist;
            track.album = metadataText(tags.album) || track.album;
            track.genre = metadataText(tags.genre) || track.genre;
            renderTrackList();
          }
          resolve();
        };

        try {
          reader.read(track.file, {
            onSuccess: ({ tags }) => finish(tags),
            onError: (error) => {
              console.warn(`Unable to read ID3 metadata for "${track.title}":`, error);
              finish(null);
            }
          });
        } catch (error) {
          console.warn(`Unable to read ID3 metadata for "${track.title}":`, error);
          finish(null);
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

    async function persistPlaylist() {
      const localTracks = tracks.filter((track) => track.localFile);
      if (!localTracks.length) return;
      const generation = importGeneration;
      try {
        for (const track of localTracks) {
          if (track.file) await saveAudioFile(track);
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
      const workerCount = Math.min(4, importedTracks.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (generation === importGeneration && nextIndex < importedTracks.length) {
          const track = importedTracks[nextIndex];
          nextIndex += 1;
          await readTrackMetadata(track, generation);
          await readTrackDuration(track, generation);
        }
      });
      await Promise.all(workers);
      if (generation === importGeneration) await persistPlaylist();
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
      tracks = [...previousTracks, ...newTracks];
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
      void persistPlaylist();
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
        });
        range.addEventListener("dblclick", () => {
          eqValues[index] = 0;
          eqBaseValues[index] = 0;
          range.value = "0";
          eqActivePreset = "Custom";
          eqPresetPill = null;
          updateEqDisplay();
          applyEqValues();
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
      document.getElementById("eq-active-preset").textContent = `Studio Clarity + ${eqActivePreset}`;
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
        filter.gain.setTargetAtTime(clarityEnabled ? gains[index] : 0, audioContext.currentTime, .015);
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

    function setClarityProfile(name) {
      if (!Object.prototype.hasOwnProperty.call(clarityProfiles, name)) return;
      activeClarityProfile = name;
      document.querySelectorAll(".clarity-profile-card").forEach((card) => {
        const selected = card.dataset.profile === name;
        card.classList.toggle("selected", selected);
        card.setAttribute("aria-checked", String(selected));
      });
      applyClarityProfile();
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
    }

    function setupEqualizer() {
      renderEqPresets();
      renderEqBands();

      document.getElementById("eq-toggle").addEventListener("click", () => setEqEnabled(!eqEnabled));
      document.getElementById("clarity-toggle").addEventListener("click", () => setClarityEnabled(!clarityEnabled));
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
    document.getElementById("shuffle").addEventListener("click", (event) => {
      shuffleOn = !shuffleOn;
      event.currentTarget.classList.toggle("selected", shuffleOn);
      showToast(shuffleOn ? "Shuffle is on" : "Shuffle is off");
    });
    document.getElementById("repeat").addEventListener("click", (event) => {
      repeatOn = !repeatOn;
      audio.loop = repeatOn;
      event.currentTarget.classList.toggle("selected", repeatOn);
      showToast(repeatOn ? "Repeat is on" : "Repeat is off");
    });
    document.getElementById("volume").addEventListener("input", (event) => { audio.volume = Number(event.target.value); });
    audio.volume = Number(document.getElementById("volume").value);
    document.getElementById("open-folder").addEventListener("click", () => folderInput.click());
    document.getElementById("import-shortcut").addEventListener("click", () => folderInput.click());
    categoryNavigation.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      activeLibraryCategory = button.dataset.category;
      activeFolderSelection = null;
      playbackTrackIndices = tracks.map((track, index) => index);
      document.querySelectorAll(".nav-button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderLibraryCategories();
      renderTrackList();
      renderQueue();
      renderPlaylistHeading(libraryFolderName);
      document.getElementById("library-section").scrollIntoView({ behavior: "smooth", block: "start" });
      void persistPlaylist();
    });
    document.getElementById("featured-play").addEventListener("click", () => setTrack(0, true));
    document.getElementById("quick-picks").addEventListener("click", (event) => {
      const button = event.target.closest("[data-track]");
      if (button) setTrack(Number(button.dataset.track), true);
    });
    document.getElementById("listen-again").addEventListener("click", (event) => {
      const button = event.target.closest("[data-track]");
      if (button) setTrack(Number(button.dataset.track), true);
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
    audio.addEventListener("loadedmetadata", () => {
      duration.textContent = formatTime(audio.duration);
      const currentTrack = tracks[activeTrack];
      if (currentTrack) {
        currentTrack.time = formatTime(audio.duration).replace(/^0/, "");
        const currentDuration = list.querySelector(`.track[data-track="${activeTrack}"] .track-time`);
        if (currentDuration) currentDuration.textContent = currentTrack.time;
      }
    });
    audio.addEventListener("timeupdate", () => {
      elapsed.textContent = formatTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        const progress = audio.currentTime / audio.duration * 100;
        seek.value = String(Math.round(progress * 10));
        setSeekFill(progress);
      }
    });
    audio.addEventListener("play", updatePlayState);
    audio.addEventListener("pause", updatePlayState);
    audio.addEventListener("ended", () => { if (!repeatOn) stepTrack(1); });
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
      setTrack(index, true);
    });
    document.querySelector(".queue").addEventListener("click", (event) => {
      const button = event.target.closest(".queue-cover");
      if (button) setTrack(Number(button.dataset.track), true);
    });
    document.getElementById("search").addEventListener("input", (event) => {
      renderTrackList();
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
        if (button === eqNavButton) setEqOverlayOpen(!eqOverlay.classList.contains("open"));
        else if (button.dataset.view === "home") {
          activeNavigationView = "home";
          renderLibraryCategories();
          document.getElementById("main-content").scrollTo({ top: 0, behavior: "smooth" });
          if (eqOverlay.classList.contains("open")) setEqOverlayOpen(false);
        } else if (button.dataset.view === "playlists") {
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
          setEqOverlayOpen(false);
          button.focus();
        }
      });
    });

    setupEqualizer();
    setupVisualizer();
    animateBars();
    setTrack(0, false);
    void restorePlaylist();
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) importedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    });
