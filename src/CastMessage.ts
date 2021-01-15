export type Message = MediaStatusMessage | ReceiverStatusMessage;

export namespace ReceiverStatusMessage {
  export function is(message: Message): message is ReceiverStatusMessage {
    return message.type === "RECEIVER_STATUS";
  }

  export type Application = {
    appId: string;
    displayName: string;
    iconUrl: string;
    isIdleScreen: boolean;
    launchedFromCloud: boolean;
    namespaces: { name: string }[];
    sessionId: string;
    statusText: string;
    transportId: string;
    universalAppId: string;
  };
}

export type ReceiverStatusMessage = {
  requestId?: number;
  type: "RECEIVER_STATUS";
  status: {
    applications?: ReceiverStatusMessage.Application[];
    //userEq: {};
    volume: {
      controlType: "attenuation";
      level: number;
      muted: boolean;
      stepInterval: number;
    };
  };
};

export namespace MediaStatusMessage {
  export function is(message: Message): message is MediaStatusMessage {
    return message.type === "MEDIA_STATUS";
  }

  export type Status = {
    mediaSessionId: string;
    playbackRate: number;
    playerState: "PAUSED" | "IDLE" | "BUFFERING" | "BUFFERED" | "PLAYING";
    currentTime?: number;
    supportedMediaCommands: number;
    volume: { level: number; muted: boolean };
    activeTrackIds?: [];
    media?: Media;
    currentItemId?: number;
    items?: {
      itemId: number;
      media: Media;
      autoplay: boolean;
      //customData: {};
      orderId: number;
    }[];
    customData: { playerState?: number };
    idleReason?: "FINISHED";
  };

  export type Media = {
    contentId: string;
    streamType?: "BUFFERED";
    contentType: string;
    customData?: { listId?: string; currentIndex?: number };
    metadata?: {
      metadataType: number;
      title: string;
      subtitle: string;
      images: { url: string }[];
    };
    duration?: number;
    tracks?: {
      trackId: number;
      trackContentType: string;
      type: string;
      language: string;
      roles: [];
    }[];
    breakClips?: [];
    breaks?: [];
  };
}

export type MediaStatusMessage = {
  requestId?: number;
  type: "MEDIA_STATUS";
  status: MediaStatusMessage.Status[];
};
