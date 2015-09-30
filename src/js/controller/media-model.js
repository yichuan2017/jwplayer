define([
    'utils/helpers',
    'providers/providers',
    'controller/storage',
    'controller/qoe',
    'utils/underscore',
    'utils/backbone.events',
    'utils/simplemodel',
    'events/events',
    'events/states'
], function(utils, Providers, storage, QOE, _, Events, SimpleModel, events, states) {

    // Represents the state of the player
    var MediaModel = function(pm) {
        var _this = this,
            // Video provider
            _provider;

        this._playerModel = pm;
        this.attributes = {};

        this.setup = function(config) {

            _.extend(this.attributes, config, {
                // Initial state, upon setup
                state: states.IDLE,
                duration: 0,
                position: 0,
                buffer: 0,
                active: false
            });

            return this;
        };

        function _videoEventHandler(type, data) {
            switch (type) {
                case 'flashBlocked':
                    this.set('flashBlocked', true);
                    return;
                case 'flashUnblocked':
                    this.set('flashBlocked', false);
                    return;

                case 'volume':
                case 'mute':
                    this.set(type, data[type]);
                    return;

                case events.JWPLAYER_MEDIA_TYPE:
                    this.set('mediaType', data.mediaType);
                    break;

                case events.JWPLAYER_PLAYER_STATE:
                    this.set('state', data.newstate);

                    // This "return" is important because
                    //  we are choosing to not propagate this event.
                    //  Instead letting the master controller do so
                    return;

                case events.JWPLAYER_MEDIA_BUFFER:
                    this.set('buffer', data.bufferPercent);

                    /* falls through */
                case events.JWPLAYER_MEDIA_META:
                    var duration = data.duration;
                    if (_.isNumber(duration)) {
                        this.set('duration', duration);
                    }
                    break;

                case events.JWPLAYER_MEDIA_BUFFER_FULL:
                    // media controller
                    if(this.get('playAttempt')) {
                        this.playVideo();
                    } else {
                        this.on('change:playAttempt', function() {
                            this.playVideo();
                        }, this);
                    }
                    break;

                case events.JWPLAYER_MEDIA_TIME:
                    this.set('position', data.position);
                    this.set('duration', data.duration);
                    break;
                case events.JWPLAYER_PROVIDER_CHANGED:
                    this.set('provider', _provider.getName());
                    break;

                case events.JWPLAYER_MEDIA_LEVELS:
                    this.setQualityLevel(data.currentQuality, data.levels);
                    this.set('levels', data.levels);
                    break;
                case events.JWPLAYER_MEDIA_LEVEL_CHANGED:
                    this.setQualityLevel(data.currentQuality, data.levels);
                    break;
                case events.JWPLAYER_AUDIO_TRACKS:
                    this.setCurrentAudioTrack(data.currentTrack, data.tracks);
                    this.set('audioTracks', data.tracks);
                    break;
                case events.JWPLAYER_AUDIO_TRACK_CHANGED:
                    this.setCurrentAudioTrack(data.currentTrack, data.tracks);
                    break;

                case 'visualQuality':
                    var visualQuality = _.extend({}, data);
                    this.set('visualQuality', visualQuality);
                    break;
            }

            var evt = _.extend({}, data, {type: type});
            this.trigger(type, evt);
        }

        this.setQualityLevel = function(quality, levels){
            if (quality > -1 && levels.length > 1 && _provider.getName().name !== 'youtube') {
                this.set('currentLevel', parseInt(quality));
            }
        };

        this.setCurrentAudioTrack = function(currentTrack, tracks) {
            if (currentTrack > -1 && tracks.length > 1) {
                this.set('currentAudioTrack', parseInt(currentTrack));
            }
        };

        this.initProvider = function(Provider) {

            _provider = new Provider(_this.get('id'), _this._playerModel.getConfiguration());

            if (_this._playerModel.get('mediaContainer')) {
                _provider.setContainer(_this._playerModel.get('mediaContainer'));
            } else {
                _this._playerModel.once('change:mediaContainer', function(model, container) {
                    _provider.setContainer(container);
                });
            }

            this.set('provider', _provider.getName());

            _provider.volume(_this._playerModel.get('volume'));
            _provider.mute(_this._playerModel.get('mute'));
            _provider.on('all', _videoEventHandler, this);

            _this._playerModel.on('change:mute', function(model, mute) {
                _provider.mute(mute);
            });
            _this._playerModel.on('change:volume', function(model, volume) {
                _provider.volume(volume);
            });
        };

        this.destroy = function() {
            if (_provider) {
                _provider.off(null, null, this);
                _provider.destroy();
            }
        };

        this.getVideo = function() {
            return _provider;
        };

        this.loadMediaItem = function(item) {
            this.item = item;

            var source = item && item.sources && item.sources[0];
            if (source === undefined) {
                // source is undefined when resetting index with empty playlist
                return;
            }

            // select provider based on item source (video, youtube...)
            var Provider = this.chooseProvider(source);
            if (!Provider) {
                throw new Error('No suitable provider found');
            }

            this.initProvider(Provider);

            // this allows the providers to preload
            if (_provider.init) {
                _provider.init(item);
            }

            this.trigger('mediaItemSet');
        };

        // Give the option for a provider to be forced
        this.chooseProvider = function(source) {
            return _this._playerModel.getProviders().choose(source).provider;
        };

        this.resetProvider = function() {
            _provider = null;
        };

        this.loadVideo = function() {
            this.set('playAttempt', true);
            this.trigger(events.JWPLAYER_MEDIA_PLAY_ATTEMPT);

            this.set('position', this.item.starttime || this.get('position') || 0);
            this.set('duration', this.item.duration || this.get('duration') || 0);
            _provider.load(this.item);
        };

        this.playVideo = function() {
            _provider.play();
        };
        this.pauseVideo = function() {
            _provider.pause();
        };
        this.stopVideo = function() {
            _provider.stop();
        };

        this.seek = function(val) {
            _provider.seek(val);
        };
        this.setCurrentQuality = function(val) {
            _provider.setCurrentQuality(val);
        };

        this.setVideoSubtitleTrack = function(trackIndex) {
            this.set('captionsIndex', trackIndex);

            if (_provider.setSubtitlesTrack) {
                _provider.setSubtitlesTrack(trackIndex);
            }
        };

        this.setFullscreen = function(v) {
            _provider.setFullscreen(v);
        };
    };

    _.extend(MediaModel.prototype, SimpleModel);

    return MediaModel;
});