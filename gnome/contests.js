// web
const Soup = imports.gi.Soup;

// file system
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

// set timeout
const Mainloop = imports.mainloop;
const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Self = ExtensionUtils.getCurrentExtension();

const CODEFORCES_API_URL = "https://codeforces.com/api/contest.list?gym=false";

var Contests = class {
    constructor() {
        // https://github.com/ifl0w/RandomWallpaperGnome3/blob/develop/randomwallpaper%40iflow.space/wallpaperController.js
        let xdg_cache_home = GLib.getenv("XDG_CACHE_HOME");
        if (!xdg_cache_home) xdg_cache_home = `${GLib.getenv("HOME")}/.cache`;
        this.cacheLocation = `${xdg_cache_home}/${Self.metadata["uuid"]}/`;
        this.cacheFile = this.cacheLocation + "contest.json";

        this.retriesLeft = 5;
        this.retryTime = 1;
        this.refreshTimeout = null;
        this.allContests = [];
        this.nextContest = null;
        this.loadFromFile();
        this.refresh();
    }

    //Issue #7: complete this function, also call set Next contest and update contest
    loadFromFile() {}

    //Issue #7: complete this function
    saveToFile() {}

    refresh() {
        this.retriesLeft--;

        // remove refreshTimeout used when refresh fails
        if (this.refreshTimeout) {
            Mainloop.source_remove(this.refreshTimeout);
            this.refreshTimeout = null;
        }

        let session = new Soup.SessionAsync();
        let message = Soup.Message.new("GET", CODEFORCES_API_URL);

        session.queue_message(message, (session, message) => {
            try {
                let response = JSON.parse(message.response_body.data);
                if (response.status != "OK") throw "Got non OK status";

                this.updateContests(response.result);

                // if successful after retries, restore these
                this.retriesLeft = 5;
                this.retryTime = 1;
                this.refreshTimeout = Mainloop.timeout_add_seconds(6 * 3600, Lang.bind(this, this.refresh));
            } catch (e) {
                global.log("ContestCountdown: Contest refresh failed\n retry left " + this.retriesLeft + "\n" + e);

                if (this.retriesLeft) {
                    // if retries are left, then retry with exponentialy increasing time
                    this.retryTime *= 2;
                    this.refreshTimeout = Mainloop.timeout_add_seconds(this.retryTime, Lang.bind(this, this.refresh));
                } else {
                    // permanent fail, no more try
                    this.retriesLeft = 5;
                    this.retryTime = 1;
                }
            }
        });
    }

    updateContests(newContests) {
        newContests = this._filterContest(newContests);

        newContests.forEach((contest) => {
            if (!this.allContests.some((existingContest) => existingContest.id == contest.id)) {
                if (!("participating" in contest)) contest.participating = true;
                this.allContests.push(contest);
            }
        });

        this.allContests = this._filterContest(this.allContests);

        this.setNextContest();
        this.saveToFile();
    }

    _filterContest(contests) {
        contests = contests.filter((contest) => contest.startTimeSeconds && contest.phase == "BEFORE" && this.secondsTillContest(contest) >= 0);

        contests.sort((a, b) => {
            return parseInt(a.startTimeSeconds) - parseInt(b.startTimeSeconds);
        });

        return contests;
    }

    secondsTillContest(contest) {
        return Math.floor((new Date(contest.startTimeSeconds * 1000) - new Date()) / 1000);
    }

    setNextContest() {
        this.nextContest = null;
        this.allContests = this._filterContest(this.allContests);
        for (let contest of this.allContests)
            if (contest.participating) {
                this.nextContest = contest;
                break;
            }
    }

    secondsTillNextContest() {
        if (this.nextContest) {
            let timeDiff = this.secondsTillContest(this.nextContest);
            if (timeDiff >= 0) return timeDiff;
            else {
                this.setNextContest();
                return this.secondsTillNextContest();
            }
        } else {
            // when no next contest
            // if still trying to load data, return -1
            // if failed to load, return -Infinity
            // if no upcoming contest, return Infinity

            if (this.retriesLeft < 5) return -1;
            if (this.allContests.length == 0) return -Infinity;
            return Infinity;
        }
    }
};
