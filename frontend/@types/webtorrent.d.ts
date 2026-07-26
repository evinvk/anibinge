declare module "webtorrent" {
  import { EventEmitter } from "events";

  interface TorrentFile {
    name: string;
    path: string;
    length: number;
    downloaded: number;
    progress: number;
    renderTo(element: HTMLMediaElement, opts?: any): void;
    streamTo(element: HTMLMediaElement, opts?: any): void;
    getBlob(callback: (err: Error | null, blob: Blob) => void): void;
    getBlobURL(callback: (err: Error | null, url: string) => void): void;
  }

  interface Torrent {
    infoHash: string;
    magnetURI: string;
    name: string;
    progress: number;
    downloaded: number;
    downloadedSpeed: number;
    uploadSpeed: number;
    files: TorrentFile[];
    ready: boolean;
    destroy(callback?: () => void): void;
    on(event: "ready" | "done" | "error" | "download" | "upload", callback: (...args: any[]) => void): void;
  }

  interface WebTorrentOptions {
    maxConns?: number;
    dht?: boolean;
    tracker?: boolean;
    webSeeds?: boolean;
  }

  class WebTorrent extends EventEmitter {
    constructor(options?: WebTorrentOptions);
    add(torrent: string | Buffer, opts?: any, ontorrent?: (torrent: Torrent) => void): Torrent;
    seed(input: any, opts?: any, onseed?: (torrent: Torrent) => void): Torrent;
    remove(infoHash: string | Torrent, callback?: () => void): void;
    get(infoHash: string): Torrent | null;
    downloadSpeed: number;
    uploadSpeed: number;
    torrents: Torrent[];
    destroy(callback?: () => void): void;
  }

  export default WebTorrent;
}
