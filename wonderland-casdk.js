/* Wrapper class for CASDK to handle callbacks and other boilterplate tasks */
export class WLCASDK {
    gameId = null;

    static init(debug = false, gameId = null) {
        this.inventory = [];
        this.gameId = gameId;
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
            for(const f of this.balanceUpdateCallbacks) f(a.currency);
        }.bind(this));
    }

    static loginStatusChangeCallbacks = [];
    /** Calls all `loginStatusChangeCallbacks` */
    static updateLoginStatus(e) {
        if(e.detail.status === 'connected') {
            for(const f of this.loginStatusChangeCallbacks) f(true);
            this.getInventory();
            this.updateCoinBalance();
        } else {
            for(const f of this.loginStatusChangeCallbacks) f(false);
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
            this.inventory = i.inventory;
            for(const f of this.inventoryUpdateCallbacks) f(false);
        }).catch(function() {
          this.inventory = [];
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
            this.catalog = c.catalog;
            if(!casdk.isLoggedIn()) {
                return;
            }
            this.getInventory();
        }.bind(this));
    }

    static async purchaseItem(item) {
        if(this.activePurchase || !this.catalog) return;

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
            casdk.purchaseItem(this.gameId, item.itemId, item.price)
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
                w.addEventListener('beforeunload', () => {
                    this.updateCoinBalance();
                });
            });
        } else {
            const w = window.open('/coin');
            w.addEventListener('beforeunload', () => {
                this.updateCoinBalance();
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
            for(const f of this.userUpdateCallbacks) f(userData.user);
        });
    }
};

/**
@class casdk-login-button
@classdesc CASDK Login Button

Adds a click callback to an existing `cursor-target` (or creates one) which
opens the Construct Arcade login dialog.

If the user is already logged in, the callback will not be added.

This will eventually trigger `WLCASDK.userUpdateCallbacks`.

@property {WL.Type.Object} loginButton Optional object to disable on login.
*/
WL.registerComponent('casdk-login-button', {
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

/**
@class casdk-user-message
@classdesc CASDK User Message Component

Switches a text component attached to the same object to between
a message when logged out and a message when logged in (which can
make use of the username by `{username}`), e.g. greet the user by
his username.

@property {WL.Type.String} messageLoggedIn Message to display when user
    is logged in.
@property {WL.Type.String} messageLoggedOut Message to display when user
    is not logged in.
*/
WL.registerComponent('casdk-user-message', {
    messageLoggedIn: {type: WL.Type.String, default: "Welcome, {username}!"},
    messageLoggedOut: {type: WL.Type.String, default: "Log in to submit scores!"},
}, /** @lends casdk-user-message */ {
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

    /**
     * Update username
     *
     * @param {string} u New username
     */
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

    /*
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

/**
@class casdk
@classdesc CASDK Initializer

Initializes the Construct Arcade SDK.

@property {WL.Type.Bool} debug Initialize in debug mode, allowing testing without deploying to Construct Arcade
@property {WL.Type.String} gameId Your game id, retrieve one from the Construct Arcade team.
*/
WL.registerComponent('casdk', {
    debug: {type: WL.Type.Bool, default: false},
    gameId: {type: WL.Type.String, default: 'your-game-id'}
}, {
    start: function() {
        /* Timeout ensures other casdk components registered their callbacks
         * before the SDK is initialized */
        setTimeout(() => WLCASDK.init(this.debug, this.gameId), 0);
    }
});

/**
@class casdk-leaderboard
@classdesc CASDK Leaderboard

Handles updating of three leaderboard table columns and submission of scores
to the Construct Arcade API services.

@property {WL.Type.String} leaderboardId Construct Arcade Leaderboard Id, contact their support to get one
@property {WL.Type.Object} columnRank Object with text component to set to the rank column
@property {WL.Type.Object} columnName Object with text component to set to the display name column
@property {WL.Type.Object} columnScore Object with text component to set to the score column
@property {WL.Type.Int} maxRows Max amount of rows to display
@property {WL.Type.Enum} scoreType Score type for display and sorting. Penalty is "bad" score.
Time based scores expect values in deciseconds. If you need
other units, use the scoreStorageMultiplier.
@property {WL.Type.Float} scoreStorageMultiplier Multiplier to retrieve an integral value to submit to Construct Arcade leaderboards
@property {WL.Type.Enum} mode Whether to show scores around player's score or World scores, starting at 1.
*/
WL.registerComponent('casdk-leaderboard',
    {
    leaderboardId: {type: WL.Type.String, default: 'my-game-1'},
    columnRank: {type: WL.Type.Object},
    columnName: {type: WL.Type.Object},
    columnScore: {type: WL.Type.Object},
    maxRows: {type: WL.Type.Int, default: 8},
    scoreType: {type: WL.Type.Enum, values:
        ['score', 'penalty', 'longest time', 'fastest time'],
        default: 'score'},
    scoreStorageMultiplier: {type: WL.Type.Float, default: 1.0},
    mode: {type: WL.Type.Enum, values: ['world', 'player']},
}, /** @lends casdk-leaderboard */ {
    init: function() {
        if(this.scoreStorageMultiplier == 0) {
            throw new Error("scoreStorageMultiplier cannot be 0 on", this.object.name);
        }

        if(!this.columnRank) console.warn("[casdk-leaderboard] columnRank not set on", this.object.name);
        if(!this.columnName) console.warn("[casdk-leaderboard] columnName not set on", this.object.name);
        if(!this.columnScore) console.warn("[casdk-leaderboard] columnScore not set on", this.object.name);

        if(this.scoreType > 1) {
            this.valueRenderer = (v) => {
                const ds = Math.floor(v % 10); /* deciseconds */
                const s = Math.floor(v/10) % 60;
                const m = Math.floor(v/600);
                return `${m}:${s < 10 ? '0' : ''}${s}.${ds}`
            };
        }
    },

    start: function() {
        this.setLeaderboardId(this.leaderboardId);
    },

    /**
     * Update texts to match internal leaderboard data.
     *
     * Usually called automatically for you.
     */
    updateTexts: function() {
        const c = this.leaderboard.columns;
        if(this.columnRank)
            this.columnRank.getComponent('text').text = c.rank.slice(0, this.maxRows).join('\n');
        if(this.columnName)
            this.columnName.getComponent('text').text = c.displayName.slice(0, this.maxRows).join('\n');
        if(this.columnScore)
            this.columnScore.getComponent('text').text = c.score.slice(0, this.maxRows).join('\n');
    },

    /**
     * Set the id of the leaderboard.
     *
     * Get ids from the Construct Arcade team, reach out to them via Discord or E-Mail.
     *
     * @param {string} newId New leaderboard id.
     */
    setLeaderboardId: function(newId) {
        this.leaderboardId = newId;

        const leaderboardSettings = {
            sortOrder: (this.scoreType & 1 == 0)
                ? WLCASDKLeaderboard.SortOrder.Ascending : WLCASDKLeaderboard.SortOrder.Descending,
            maxRows: this.maxRows,
            mode: this.mode,
            scoreStorageMultiplier: this.scoreStorageMultiplier,
        };
        if(this.valueRenderer) leaderboardSettings.valueRenderer = this.valueRenderer;
        this.leaderboard = new WLCASDKLeaderboard(this.leaderboardId, leaderboardSettings);
        /* Don't retrieve empty ids */
        if(this.leaderboardId) {
            this.leaderboard.getLeaderboard()
                .then(this.updateTexts.bind(this));
        }
    },

    /**
     * @callback ValueRenderer
     *
     * Function that takes a number score value and returns a string representation.
     *
     * @param {number} score Score to convert to string.
     * @returns {string} Converted score
     */
    /**
     * Set a function for converting leaderboard score value into string.
     *
     * Calls updateTexts() if a leaderboard is currently active.
     *
     * @param {ValueRenderer} valueRenderer Function for converting scores to string
     */
    setValueRenderer: function(valueRenderer) {
        this.valueRenderer = valueRenderer;
        if(this.leaderboard) {
            this.leaderboard.options.valueRenderer;
            this.updateTexts();
        }
    },

    /**
     * Submit a score for player with given name
     *
     * @param {string} name Player name
     * @param {number} score Score to submit
     */
    submit: function(name, score) {
        this.leaderboard.submit(name, score);
        this.updateTexts();
    }
});

/**
@class casdk-coin-balance
@classdesc Construct Arcade Coin balance display

Changes a text to display the amount of coins the user
currently owns.

@property {WL.Type.Material} material Material to use when creating a text component.
    Can be `null` if the object already has a text component attached.
*/
WL.registerComponent('casdk-coin-balance', {
    material: {type: WL.Type.Material}
}, /** @lends casdk-coin-balance */ {
    init: function() {
        this.balance = '?';
        WLCASDK.balanceUpdateCallbacks.push(this.updateCoinBalance.bind(this));
    },
    start: function() {
        this.text = this.object.getComponent('text') || this.object.addComponent('text', {
            material: this.material,
            text: this.balance.toString()
        });
    },

    updateCoinBalance: function(balance) {
        this.balance = balance;
        if(this.text) this.text = balance.toString();
    }
});

/**
@class casdk-purchase-button
@classdesc Button to purchase a specific item.

@property {WL.Type.String} itemId Item to purchase
*/
WL.registerComponent('casdk-coin-balance', {
    material: {WL.Type.Material}
}, /** @lends casdk-coin-balance */ {
    start: function() {
        this.text = this.object.getComponent('text') || this.object.addComponent('text', {
            material: this.material
        });

        WLCASDK.balanceUpdateCallbacks.push(this.updateCoinBalance.bind(this));
    },

    updateCoinBalance: function(balance) {
        this.text = balance.toString();
    }
});
