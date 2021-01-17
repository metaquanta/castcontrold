// https://developers.google.com/cast/docs/reference/messages
export namespace ReceiverStatusMessage {
  export function is(
    message: Record<string, unknown>
  ): message is ReceiverStatusMessage {
    return message.type === "RECEIVER_STATUS";
  }

  export type Application = {
    appId: string; // CC1AD845, 233637DE, E8C28D3C
    displayName: string; // Default Media Receiver, YouTube, Backdrop
    iconUrl: string;
    isIdleScreen: boolean;
    launchedFromCloud: boolean;
    namespaces: { name: string }[];
    sessionId: string;
    statusText: string;
    transportId: string; // == sessionId
    universalAppId: string; // == appId
  };
}

// urn:x-cast:com.google.cast.receiver
export type ReceiverStatusMessage = {
  requestId?: number;
  type: "RECEIVER_STATUS";
  status: {
    applications?: [ReceiverStatusMessage.Application];
    //userEq: {};
    volume?: {
      controlType: "attenuation";
      level: number;
      muted: boolean;
      stepInterval: number;
    };
  };
};

export namespace MediaStatusMessage {
  export function is(
    message: Record<string, unknown>
  ): message is MediaStatusMessage {
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
    idleReason?: "FINISHED" | "ERROR" | "CANCELLED" | "INTERRUPTED";
    repeatMode?: "REPEAT_OFF";
  };

  export type Media = {
    contentId: string;
    streamType?: "BUFFERED" | "NONE" | "LIVE";
    contentType: string;
    customData?: { listId?: string; currentIndex?: number };
    metadata?: {
      metadataType: number; // 0,1,2,3,4
      title?: string;
      seriesTitle?: string;
      subtitle?: string;
      images?: { url: string; height?: number; width?: number }[];
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
// urn:x-cast:com.google.cast.media
export type MediaStatusMessage = {
  requestId?: number;
  type: "MEDIA_STATUS";
  status: [MediaStatusMessage.Status];
};

// urn:x-cast:com.google.cast.multizone
export type DeviceUpdatedMessage = {
  requestId?: number;
  type: "DEVICE_UPDATED";
  device: {
    capabilities: number;
    deviceId: string;
    name: string;
    volume: { level: number; muted: boolean };
  };
};

// urn:x-cast:com.google.youtube.mdx
export type MdxSessionStatusMessage = {
  type: "mdxSessionStatus";
  data: { screenId: string; deviceId: string };
};

/* namespaces:

"urn:x-cast:com.google.cast.debugoverlay"
"urn:x-cast:com.google.cast.cac"
"urn:x-cast:com.google.cast.media"
"urn:x-cast:com.google.youtube.mdx"
"urn:x-cast:com.google.cast.sse"
"urn:x-cast:com.google.cast.remotecontrol"

*/
