export class WLCASDK {

    static init(debug = false) {
        this.inventory = [];
        if(!('casdk' in window) && debug) {
            this.debug = true;
            this.debugIsLoggedIn = false;
            this.updateLoginStatus({detail: {status: "none"}});
            return
        }

        window.addEventListener('casdk-login-status', this.updateLoginStatus.bind(this));
    }

    static balanceUpdateCallbacks = [];
    static updateCoinBalance() {
        (this.debug ?  new Promise((resolve, _) => {
            /* Simulate a delayed request return */
            setTimeout(function() {
                resolve({currency: 42});
            }.bind(this), 1000);
        }) : casdk.getAmountCurrency()).then(function(a) {
            if(a.error) return;
            for(const f of WLCASDK.balanceUpdateCallbacks) f(a.currency);
        }.bind(this));
    }

    static loginStatusChangeCallbacks = [];
    /** Calls all `loginStatusChangeCallbacks` */
    static updateLoginStatus(e) {
        if(e.detail.status === 'connected') {
            for(const f of WLCASDK.loginStatusChangeCallbacks) f(true);
            WLCASDK.getInventory();
            WLCASDK.updateCoinBalance();
        } else {
            for(const f of WLCASDK.loginStatusChangeCallbacks) f(false);
        }
    }

    static inventoryUpdateCallbacks = [];
    static async getInventory() {
        (this.debug ?
            new Promise((resolve, _) => {
                /* Simulate a delayed request return */
                setTimeout(function() {
                    resolve({inventory: ['debug']});
                }.bind(this), 1000);
        }) : casdk.getInventory()).then((i) => {
            this.activePurchase = false;
            if(!i.inventory) {
                inventory = [];
                return;
            }
            WLCASDK.inventory = i.inventory;
            for(const f of WLCASDK.inventoryUpdateCallbacks) f(false);
        }).catch(function() {
          inventory = [];
          this.activePurchase = false;
        }.bind(this));
    }

    static catalogUpdateCallbacks = [];
    static async getCatalog() {
        if(this.debug) {
            console.warn("[wonderland-casdk] Debug catalog calls are not supported");
            console.warn("[wonderland-casdk] getCatalog() called");
            return
        }
        return casdk.getCatalog(this.gameId).then(function(c) {
            catalog = c.catalog;
            if(!casdk.isLoggedIn()) {
                return;
            }
            this.getInventory();
        }.bind(this));
    }

    static async purchaseItem(item) {
        if(this.activePurchase || !catalog) return;

        this.activePurchase = true;

        if(this.debug) {
            console.warn("[wonderland-casdk] Debug item purchase calls are not supported");
            console.warn("[wonderland-casdk] purchaseItem() called with item:", item);
            return
        }
        if(!casdk.isLoggedIn()) {
            this.login();
            return;
        }

        if(item && !this.itemOwned) {
            casdk.purchaseItem(this.gameId, this.item.itemId, this.item.price)
                .then(this.unlock.bind(this))
                .catch(function(err){
                  if(err.error == "Not enough funds") {
                    openCoinStore();
                  }
                  this.activePurchase = false;
                }.bind(this));
        }
    }

    static openCoinStore() {
        if(WL.xrSession) {
            WL.xrSession.end().then(function() {
                const w = window.open('/coin');
                w.addEventListener('beforeunload', function() {
                    WLCASDK.updateCoinBalance();
                });
            });
        } else {
            const w = window.open('/coin');
            w.addEventListener('beforeunload', function() {
                WLCASDK.updateCoinBalance();
            });
        }
    }

    static async login() {
        if(this.debug) {
            return new Promise((resolve, _) => {
                /* Simulate a delayed request return */
                setTimeout(function() {
                    this.debugIsLoggedIn = true;
                    this.updateLoginStatus({detail: {status: "connected"}});
                    resolve(true);
                }.bind(this), 1000);
            });
        }
        if(WL.xrSession) {
            return WL.xrSession.end().then(function() {
                return casdk.loginButtonPressed();
            });
        } else {
            return casdk.loginButtonPressed();
        }
    }

    static userUpdateCallbacks = [];
    static async getUser() {
        (this.debug ?
            /* Simulate a delayed request return */
            new Promise((resolve, _) => {
                /* Simulate a delayed request return */
                setTimeout(function() {
                    resolve({user: {displayName: "WonderfulUser"}});
                }.bind(this), 1000);
            })
        : casdk.getUser()).then((userData) => {
            if(!userData.user) return;
            for(const f of WLCASDK.userUpdateCallbacks) f(userData.user);
        });
    }
};

/**
CASDK Login Button

Adds a click callback to an existing `cursor-target` (or creates one) which
opens the Construct Arcade login dialog.

If the user is already logged in, the callback will not be added.

This will eventually trigger `WLCASDK.userUpdateCallbacks`.
*/
WL.registerComponent('casdk-login-button', {
    /* Optional object to disable on login */
    loginButton: {type: WL.Type.Object}
}, {
    init: function() {
        if(('casdk' in window) && casdk.isLoggedIn()) {
            this.onLoggedIn();
            return;
        }

        /* Still add the setup for casdk in debug mode */
        WLCASDK.loginStatusChangeCallbacks.push(this.onLoginStatusChange.bind(this));
        this.target = this.object.getComponent('cursor-target') || this.object.addComponent('cursor-target');
    },

    onClick: function() {
        WLCASDK.login();
    },

    onLoggedIn: function() {
        WLCASDK.getUser();
        if(this.clickCallback) {
            this.target.removeClickFunction(this.clickCallback);
            this.clickCallback = null;
        }
        if(this.loginButton) this.loginButton.active = false;
    },

    onLoginStatusChange: function(loggedIn) {
        if(loggedIn) {
            this.onLoggedIn();
        } else {
            this.clickCallback = this.onClick.bind(this);
            this.target.addClickFunction(this.clickCallback);
            if(this.loginButton) this.loginButton.active = true;
        }
    }
});

WL.registerComponent('casdk-user-message', {
    messageLoggedIn: {type: WL.Type.String, default: "Welcome, {username}!"},
    messageLoggedOut: {type: WL.Type.String, default: "Log in to submit scores!"},
}, {
    start: function() {
        /* Workaround for multiline strings not available yet */
        this.messageLoggedIn = this.messageLoggedIn.replaceAll('\\n', '\n');
        this.messageLoggedOut= this.messageLoggedOut.replaceAll('\\n', '\n');

        WLCASDK.loginStatusChangeCallbacks.push(this.onLoginStatusChange.bind(this));
        WLCASDK.userUpdateCallbacks.push(this.updateUsername.bind(this));
    },

    onLoginStatusChange: function(loggedIn) {
        console.log("Login status changed", loggedIn);
        if(!loggedIn) {
            this.object.getComponent('text').text = this.messageLoggedOut;
        }
    },

    updateUsername: function(u) {
        this.object.getComponent('text').text =
            this.messageLoggedIn.replaceAll('{username}', u.displayName);
    }
});

class WLCASDKLeaderboard {

    static SortOrder = {
        Ascending: 0,
        Descending: 1
    }

    static Mode = {
        World: 0,
        AroundPlayer: 1
    }

    constructor(id, options) {
        this.options = {};
        this.options.debug = options.debug || !('casdk' in window);
        this.options.sortOrder = options.sortOrder || WLCASDKLeaderboard.SortOrder.Descending;
        this.options.valueRenderer = options.valueRenderer || (v => v.toString());
        this.options.scoreStorageMultiplier = options.scoreStorageMultiplier || 1;
        this.options.maxRows = options.maxRows || 10;
        this.options.mode = options.mode || WLCASDKLeaderboard.Mode.World;

        /* Placeholder board */
        this.board = [];
        this.leaderboardId = id;
        this.leaderboards = {world: null, player: null};
    }

    toString() {
        return this.board.entries().map(pos, e => `${e.rank + 1} - ${e.displayName} - ${e.score}`).join('\n');
    }

    get columns() {
        return {
            rank: this.board.map((e) => `${e.rank + 1}`),
            displayName: this.board.map(e => e.displayName || "unknown"),
            score: this.board.map(e => this.options.valueRenderer(e.score/this.options.scoreStorageMultiplier)),
        }
    }

    /** Submit a score to the leaderboard */
    submit(score) {
        /* Math.round seems necessary to guarantee integral value */
        let submissionScore = Math.round(score * this.options.scoreStorageMultiplier);

        this.leaderboards.world = null;
        this.leaderboards.player = null;

        if(this.options.debug) {
            return new Promise((resolve, _) => {
                setTimeout(() => {
                    resolve(this.getLeaderboard());
                }, 2000)
            });
        }
        if(!casdk.isLoggedIn()) {
            /* Save score for later, in case the user wants to log in
             * now after all! */
            const scorePending = this.pendingScore != null;
            this.pendingScore = submissionScore;
            /* If there's already a submission pending, it will
             * submit the new score */
            if(!scorePending) {
                let cb;
                cb = (loggedIn) => {
                    if(loggedIn) {
                        return casdk
                            .submitScore(this.leaderboardId, this.pendingScore)
                            .then(() => {
                                this.pendingScore = null;
                                const idx = WLCASDK.loginStatusChangeCallbacks.indexOf(cb);
                                WLCASDK.loginStatusChangeCallbacks.splice(idx, 1);
                                setTimeout(this.getLeaderboard.bind(this), 400);
                            });
                    }
                };
                WLCASDK.loginStatusChangeCallbacks.push(cb);
            }
        }
        return casdk
            .submitScore(this.leaderboardId, submissionScore)
            .then(() => {
                return new Promise((resolve, _) => {
                    setTimeout(() => {
                        resolve(this.getLeaderboard());
                    }, 400)
                });
            });
    }

    /**
     * Request an update of the leaderboard entries.
     *
     * This is already done after @ref submitScore()
     */
    getLeaderboard() {
        if(this.options.debug) {
            const offset = this.options.mode ? 12 : 1;
            return new Promise((resolve, _) => {
                /* Simulate a delayed request return */
                setTimeout(function() {
                    const s = this.options.scoreStorageMultiplier;

                    let scores = [];
                    const rev = this.options.sortOrder == WLCASDKLeaderboard.SortOrder.Descending;
                    let score = rev ? 10000 : 10;
                    for(let i = 0; i < this.options.maxRows + 2; ++i) {
                            score = Math.round(rev ? score - 100*Math.random() : score + 100*Math.random());
                            /* In descending order */
                            scores.push({rank: offset + i, displayName: "User" + i.toString(),
                                score: score*s});
                    }
                    resolve(scores);
                }.bind(this), 1000);
            }).then(this.onScoresRetrieved.bind(this));
        }
        const mode = this.options.mode;
        /* TODO: Allow dynamic switching between modes */
        this.displayLeaderboard =  mode;

        return casdk.getLeaderboard(this.leaderboardId,
            this.options.sortOrder == WLCASDKLeaderboard.SortOrder.Ascending,
            mode == WLCASDKLeaderboard.Mode.AroundPlayer, this.options.maxRows)
            .then((r) => {
                this.leaderboards[mode] = r.leaderboard;
                if(this.leaderboards[this.displayLeaderboard])
                    this.onScoresRetrieved(this.leaderboards[this.displayLeaderboard]);
                return r.leaderboard;
            });
    }

    onScoresRetrieved(scores) {
        if(scores == null) throw new Error("Retrieving scores failed");
        this.board = scores;
    }
};

WL.registerComponent('casdk', {
    debug: {type: WL.Type.Bool, default: false}
}, {
    start: function() {
        /* Ensure other casdk components registered their callbacks */
        setTimeout(() => WLCASDK.init(this.debug), 0);
    }
});

WL.registerComponent('casdk-leaderboard', {
    /** Construct Arcade Leaderboard Id, contact their support to get one */
    leaderboardId: {type: WL.Type.String, default: 'my-game-1'},
    /** Object with text component to set to the rank column */
    columnRank: {type: WL.Type.Object},
    /** Object with text component to set to the display name column */
    columnName: {type: WL.Type.Object},
    /** Object with text component to set to the score column */
    columnScore: {type: WL.Type.Object},
    /** Max amount of rows to display */
    maxRows: {type: WL.Type.Int, default: 8},
    /** Score type for display and sorting. Penalty is "bad" score.
     * Time based scores expect values in deciseconds. If you need
     * other units, use the scoreStorageMultiplier. */
    scoreType: {type: WL.Type.Enum, values:
        ['score', 'penalty', 'longest time', 'fastest time'],
        default: 'score'},
    /** Multiplier to retrieve an integral value to submit to Construct Arcade leaderboards */
    scoreStorageMultiplier: {type: WL.Type.Float, default: 1.0},
    /** Whether to show scores around player's score or World scores, starting at 1. */
    mode: {type: WL.Type.Enum, values: ['world', 'player']},
}, {
    start: function() {
        if(this.scoreStorageMultiplier == 0) {
            throw new Error("scoreStorageMultiplier cannot be 0 on", this.object.name);
        }

        if(!this.columnRank) console.warn("[casdk-leaderboard] columnRank not set on", this.object.name);
        if(!this.columnName) console.warn("[casdk-leaderboard] columnName not set on", this.object.name);
        if(!this.columnScore) console.warn("[casdk-leaderboard] columnScore not set on", this.object.name);
        this.setLeaderboardId(this.leaderboardId);
    },

    updateTexts: function() {
        const c = this.leaderboard.columns;
        if(this.columnRank)
            this.columnRank.getComponent('text').text = c.rank.slice(0, this.maxRows).join('\n');
        if(this.columnName)
            this.columnName.getComponent('text').text = c.displayName.slice(0, this.maxRows).join('\n');
        if(this.columnScore)
            this.columnScore.getComponent('text').text = c.score.slice(0, this.maxRows).join('\n');
    },

    setLeaderboardId: function(newId) {
        this.leaderboardId = newId;

        const leaderboardSettings = {
            sortOrder: (this.scoreType & 1 == 0)
                ? WLCASDKLeaderboard.SortOrder.Ascending : WLCASDKLeaderboard.SortOrder.Descending,
            maxRows: this.maxRows,
            mode: this.mode,
            scoreStorageMultiplier: this.scoreStorageMultiplier,
        };
        if(this.scoreType > 1) {
            leaderboardSettings.valueRenderer = (v) => {
                const ds = Math.floor(v % 10); /* deciseconds */
                const s = Math.floor(v/10) % 60;
                const m = Math.floor(v/600);
                return `${m}:${s < 10 ? '0' : ''}${s}.${ds}`
            };
        }
        this.leaderboard = new WLCASDKLeaderboard(this.leaderboardId, leaderboardSettings);
        /* Don't retrieve empty ids */
        if(this.leaderboardId) {
            this.leaderboard.getLeaderboard()
                .then(this.updateTexts.bind(this));
        }
    },

    submit: function(name, score) {
        this.leaderboard.submit(name, score);
        this.updateTexts();
    }
});
