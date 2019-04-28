const EventEmitter = require("events");

class CurrencyScript extends EventEmitter {
    constructor() {
        super();
        this._currencies = {};
    }

    /**
     * Adds a currency to the system.
     * @param {String}  key      Currency identifier. (such as vip_tokens)
     * @param {String}  name     Currency's human readable name. (such as VIP Tokens)
     * @param {Boolean} isShared Whether the currency will use shared data or not. Useful if you want to have a money HUD etc.
     * @return {Object} The added currency object, will be null if there were any mistakes.
     * @fires currencyDefined
     */
    addCurrency(key, name, isShared) {
        if (typeof key !== "string" || key.length < 1) {
            console.error(`addCurrency: key was not a string/was an empty string.`);
            return null;
        } else if (typeof name !== "string" || name.length < 1) {
            console.error(`addCurrency: name was not a string/was an empty string. (${key})`);
            return null;
        } else if (typeof isShared !== "boolean") {
            console.error(`addCurrency: isShared was not a boolean. (${key})`);
            return null;
        } else if (this._currencies.hasOwnProperty(key)) {
            console.error(`addCurrency: Currency (${key}) already exists.`);
            return null;
        }

        const syncKey = `currency_${key}`;
        this._currencies[key] = {
            name: name,
            isShared: isShared,
            syncKey: syncKey
        };

        this.emit("currencyDefined", key, name, isShared, syncKey);
        return this._currencies[key];
    }

    /**
     * Returns whether the specified key is a registered currency or not.
     * @param  {String}  key Currency identifier.
     * @return {Boolean}
     */
    hasCurrency(key) {
        return this._currencies.hasOwnProperty(key);
    }

    /**
     * Returns the specified currency's object.
     * @param  {String} key Currency identifier.
     * @return {Object}     The currency object, will be undefined if the key isn't registered.
     */
    getCurrency(key) {
        return this._currencies[key];
    }

    /**
     * Returns an array of all registered currency identifiers.
     * @return {String[]}
     */
    getAllCurrencies() {
        return Object.keys(this._currencies);
    }

    /**
     * Returns the human readable name of the specified currency.
     * @param  {String} key Currency identifier.
     * @return {String}     Human readable name, will be Invalid Currency if the key isn't registered.
     */
    getCurrencyName(key) {
        return this.hasCurrency(key) ? this._currencies[key].name : "Invalid Currency";
    }

    /**
     * Returns whether the specified currency is shared or not.
     * @param  {String} key Currency identifier.
     * @return {Boolean}
     */
    getCurrencyIsShared(key) {
        return this.hasCurrency(key) ? this._currencies[key].isShared : false;
    }

    /**
     * Returns the sync key of the specified currency. Sync key is used with player.setVariable()
     * @param  {String} key Currency identifier.
     * @return {String}     Sync key of the currency, will be null if the key isn't registered.
     */
    getCurrencySyncKey(key) {
        return this.hasCurrency(key) ? this._currencies[key].syncKey : null;
    }

    _getSyncKeyInternal(key) {
        return (this.hasCurrency(key) && this._currencies[key].isShared) ? this._currencies[key].syncKey : null;
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
    if (Object.prototype.toString.call(newWallet) === "[object Object]") {
        const oldWallet = this._wallet;
        let replacement = {};

        // verify newWallet
        for (const key in newWallet) {
            if (currencyScript.hasCurrency(key)) {
                if (Number.isInteger(newWallet[key])) {
                    replacement[key] = newWallet[key];
                } else {
                    console.log(`Found invalid amount for "${key}" while replacing ${this.name}'s wallet, skipping it.`);
                }
            } else {
                console.log(`Found invalid currency "${key}" while replacing ${this.name}'s wallet, skipping it.`);
            }
        }

        this._wallet = replacement;

        // update shared data
        for (const key in replacement) {
            const syncKey = currencyScript._getSyncKeyInternal(key);
            if (syncKey) this.setVariable(syncKey, replacement[key]);
        }

        currencyScript.emit("walletReplaced", this, oldWallet, replacement);
        return true;
    } else {
        return false;
    }
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
    if (currencyScript.hasCurrency(currencyKey) && Number.isInteger(newAmount)) {
        const syncKey = currencyScript._getSyncKeyInternal(currencyKey);
        const oldAmount = this.getCurrency(currencyKey);

        this._wallet[currencyKey] = newAmount;

        if (syncKey) this.setVariable(syncKey, newAmount);
        currencyScript.emit("currencyUpdated", this, currencyKey, oldAmount, newAmount, "setCurrency");
        return true;
    } else {
        return false;
    }
};

/**
 * Changes the amount of specified currency the player has in their wallet by specified amount.
 * @param  {String} currencyKey Currency identifier.
 * @param  {Number} amount
 * @return {Boolean}            True if successful, false otherwise.
 */
mp.Player.prototype.changeCurrency = function(currencyKey, amount) {
    if (currencyScript.hasCurrency(currencyKey) && Number.isInteger(amount)) {
        const syncKey = currencyScript._getSyncKeyInternal(currencyKey);
        const oldAmount = this.getCurrency(currencyKey);

        if (this._wallet.hasOwnProperty(currencyKey)) {
            this._wallet[currencyKey] += amount;
        } else {
            this._wallet[currencyKey] = amount;
        }

        if (syncKey) this.setVariable(syncKey, this._wallet[currencyKey]);
        currencyScript.emit("currencyUpdated", this, currencyKey, oldAmount, this._wallet[currencyKey], "changeCurrency");
        return true;
    } else {
        return false;
    }
};

// RAGEMP Events
mp.events.add("playerJoin", (player) => {
    player._wallet = {};
});

module.exports = currencyScript;