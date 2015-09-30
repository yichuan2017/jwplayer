define([
    'utils/helpers',
    'providers/providers',
    'controller/storage',
    'controller/qoe',
    'controller/media-model',
    'utils/underscore',
    'utils/backbone.events',
    'utils/simplemodel',
    'events/events',
    'events/states'
], function(utils, Providers, storage, QOE, MediaModel, _, Events, SimpleModel, events, states) {


    // The model stores a different state than the provider
    function normalizeState(newstate) {
        if (newstate === states.LOADING || newstate === states.STALLED) {
            return states.BUFFERING;
        }
        return newstate;
    }

    // Represents the state of the player
    var PlayerModel = function() {

        // All loaded providers
        var _providers;
        //var MediaControllers = {};
        var activeMC;

        this.attributes = {};

        QOE.model(this);


        // Maybe this will be the router/mediator ?
        this.mediaController = _.extend({}, Events);
        this.mediaModel = _.extend({}, Events);

        this.setup = function(config) {
            var _cookies = {};
            if (config.cookies) {
                storage.model(this);
                _cookies = storage.getAllItems();
            }

            _.extend(this.attributes, config, _cookies, {
                // Initial state, upon setup
                state: states.IDLE,
                // Initially we don't assume Flash is needed
                flashBlocked : false,
                fullscreen: false,
                compactUI: false,
                scrubbing : false
            });

            // Mobile doesn't support autostart
            if (utils.isMobile()) {
                this.set('autostart', false);
            }

            this.updateProviders();

            return this;
        };

        this.getConfiguration = function() {
            return _.omit(this.clone(), ['mediaModel']);
        };

        this.getProviders = function() {
            if (!_providers) {
                this.updateProviders();
            }

            return _providers;
        };

        this.updateProviders = function() {
            _providers = new Providers(this.getConfiguration());
        };


        this.createMediaController = function(item) {
            var mediaModel = new MediaModel(this);
            mediaModel.setup({});

            mediaModel.loadMediaItem(item);

            return mediaModel;
        };

        this.setActiveMediaController = function(mc) {

            if (activeMC) {
                activeMC.destroy();
                activeMC.resetProvider();
                this.unmirror(activeMC);
            }
            activeMC = mc;
            this.mirror(activeMC);
        };

        this.unmirror = function() {
            if (activeMC) {
                // unlisten
                _.each(this.listeningFuncs, function (f) {
                    this.off(null, f);
                }, this);
            }
        };

        this.mirror = function(model) {
            var attrs = [
                'duration',
                'position',
                'buffer',
                'bufferFull',
                'provider',
                'mediaType'
            ];

            var playerModel = this;
            this.listeningFuncs = _.map(attrs, function(attr) {
                // Initially get value
                playerModel.set(attr, model.get(attr));

                function listener(model, val) {
                    console.log('forwarding ' + attr, val);
                    playerModel.set(attr, val);
                }

                model.on('change:'+attr, listener);
                return listener;
            });

            function eventForward(name) {
                if (name.indexOf('change:') === -1) {
                    console.log('event forward : ' + name);
                    playerModel.mediaController.trigger.apply(playerModel, arguments);
                }
            }

            model.on('all', eventForward);
            model.on('change:state', function(m, state) {
                var modelState = normalizeState(state);
                playerModel.set('state', modelState);
            });

            this.listeningFuncs.push(eventForward);
        };


        this.getVideo = function() {
            return activeMC;
        };
    };

    _.extend(PlayerModel.prototype, SimpleModel);

    return PlayerModel;
});