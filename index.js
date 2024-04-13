const EventEmitter = require("events");

const SYNC_TYPE_NONE = 0;
const SYNC_TYPE_EVERYONE = 1;
const SYNC_TYPE_PLAYER = 2;

class CurrencyScript extends EventEmitter {
    #currencies = new Map();

    constructor() {
        super();
    }

    /**
     * Adds a currency to the system.
     * @param {String}  key      Currency identifier. (such as vip_tokens)
     * @param {String}  name     Currency's human readable name. (such as VIP Tokens)
     * @param {Number}  syncType Sharing type of the currency. (0 = not shared with clients, 1 = shared with everyone, 2 = shared with just the wallet owner)
     * @return {Object} The added currency object.
     * @fires currencyDefined
     */
    addCurrency(key, name, syncType) {
        if (typeof key !== "string" || key.length < 1) {
            throw new Error("key is not a string/is an empty string");
        } else if (typeof name !== "string" || name.length < 1) {
            throw new Error("name is not a string/is an empty string");
        } else if (!Number.isInteger(syncType)) {
            throw new Error("syncType is not an integer");
        } else if (this.#currencies.has(key)) {
            throw new Error("a currency with the specified key already exists");
        } else if (syncType < SYNC_TYPE_NONE || syncType > SYNC_TYPE_PLAYER) {
            throw new Error("invalid syncType value");
        }

        const currency = {
            name: name,
            syncType: syncType,
            syncKey: `currency_${key}`
        };

        this.#currencies.set(key, currency);
        this.emit("currencyDefined", key, name, syncType, currency.syncKey);
        return currency;
    }

    /**
     * Returns whether the specified key is a registered currency or not.
     * @param  {String}  key Currency identifier.
     * @return {Boolean}
     */
    hasCurrency(key) {
        return this.#currencies.has(key);
    }

    /**
     * Returns the specified currency's object.
     * @param  {String} key Currency identifier.
     * @return {?Object}    The currency object, will be undefined if the key isn't registered.
     */
    getCurrency(key) {
        return this.#currencies.get(key);
    }

    /**
     * Returns an iterator of all registered currency identifiers.
     * @return {Iterator.<String>}
     */
    getAllCurrencies() {
        return this.#currencies.keys();
    }

    /**
     * Returns the human readable name of the specified currency.
     * @param  {String} key Currency identifier.
     * @return {String}     Human readable name, will be "Invalid Currency" if the key isn't registered.
     */
    getCurrencyName(key) {
        return this.#currencies.get(key)?.name ?? "Invalid Currency";
    }

    /**
     * Returns the sync type of the specified currency.
     * @param   {String} key Currency identifier.
     * @return  {Number}     Sync type of the currency. (0 = not shared with clients, 1 = shared with everyone, 2 = shared with just the wallet owner)
     */
    getCurrencySyncType(key) {
        return this.#currencies.get(key)?.syncType ?? SYNC_TYPE_NONE;
    }

    /**
     * Returns the sync key of the specified currency. Sync key is used with player.setVariable() or player.setOwnVariable() depending on sync type.
     * @param  {String} key Currency identifier.
     * @return {?String}    Sync key of the currency, will be null if the key isn't registered.
     */
    getCurrencySyncKey(key) {
        return this.#currencies.get(key)?.syncKey ?? null;
    }
}

const currencyScript = new CurrencyScript();

// Player Functions
/**
 * Returns the wallet object of the player.
 * @return {Object}
 */
mp.Player.prototype.getWallet = function() {
    return this._wallet;
};

/**
 * Replaces the wallet object of the player with the specified one.
 * @param {Object} newWallet
 * @return {Boolean} True if successful, false otherwise.
 * @fires walletReplaced
 */
mp.Player.prototype.setWallet = function(newWallet) {
    if (Object.prototype.toString.call(newWallet) !== "[object Object]") {
        return false;
    }

    const oldWallet = this._wallet;
    let replacement = {};

    // skip invalid newWallet items
    for (const key in newWallet) {
        if (!currencyScript.hasCurrency(key) || !Number.isInteger(newWallet[key])) {
            continue;
        }

        replacement[key] = newWallet[key];
    }

    this._wallet = replacement;

    // update shared data
    for (const key in replacement) {
        const currency = currencyScript.getCurrency(key);

        switch (currency.syncType) {
            case SYNC_TYPE_EVERYONE:
                this.setVariable(currency.syncKey, replacement[key]);
                break;

            case SYNC_TYPE_PLAYER:
                this.setOwnVariable(currency.syncKey, replacement[key]);
                break;
        }
    }

    currencyScript.emit("walletReplaced", this, oldWallet, replacement);
    return true;
};

/**
 * Returns the amount of specified currency the player has in their wallet.
 * @param  {String} currencyKey Currency identifier.
 * @return {Number}
 */
mp.Player.prototype.getCurrency = function(currencyKey) {
    return this._wallet.hasOwnProperty(currencyKey) ? this._wallet[currencyKey] : 0;
};

/**
 * Sets the amount of specified currency the player has in their wallet.
 * @param {String} currencyKey Currency identifier.
 * @param {Number} newAmount   New amount of specified currency.
 * @return {Boolean} True if successful, false otherwise.
 * @fires currencyUpdated
 */
mp.Player.prototype.setCurrency = function(currencyKey, newAmount) {
    const currency = currencyScript.getCurrency(currencyKey);
    if (currency == null || !Number.isInteger(newAmount)) {
        return false;
    }

    const oldAmount = this.getCurrency(currencyKey);
    this._wallet[currencyKey] = newAmount;

    switch (currency.syncType) {
        case SYNC_TYPE_EVERYONE:
            this.setVariable(currency.syncKey, newAmount);
            break;

        case SYNC_TYPE_PLAYER:
            this.setOwnVariable(currency.syncKey, newAmount);
            break;
    }

    currencyScript.emit("currencyUpdated", this, currencyKey, oldAmount, newAmount, "setCurrency");
    return true;
};

/**
 * Changes the amount of specified currency the player has in their wallet by specified amount.
 * @param  {String} currencyKey Currency identifier.
 * @param  {Number} amount
 * @return {Boolean}            True if successful, false otherwise.
 */
mp.Player.prototype.changeCurrency = function(currencyKey, amount) {
    const currency = currencyScript.getCurrency(currencyKey);
    if (currency == null || !Number.isInteger(amount)) {
        return false;
    }

    const oldAmount = this.getCurrency(currencyKey);
    if (this._wallet.hasOwnProperty(currencyKey)) {
        this._wallet[currencyKey] += amount;
    } else {
        this._wallet[currencyKey] = amount;
    }

    switch (currency.syncType) {
        case SYNC_TYPE_EVERYONE:
            this.setVariable(currency.syncKey, this._wallet[currencyKey]);
            break;

        case SYNC_TYPE_PLAYER:
            this.setOwnVariable(currency.syncKey, this._wallet[currencyKey]);
            break;
    }

    currencyScript.emit("currencyUpdated", this, currencyKey, oldAmount, this._wallet[currencyKey], "changeCurrency");
    return true;
};

// RAGEMP Events
mp.events.add("playerJoin", (player) => {
    player._wallet = {};
});

module.exports = currencyScript;