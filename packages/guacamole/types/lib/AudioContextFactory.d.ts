/** Provides the shared Web Audio context used by Guacamole audio implementations. */
export const AudioContextFactory: {
    singleton: AudioContext | null;
    getAudioContext(): AudioContext | null;
};
