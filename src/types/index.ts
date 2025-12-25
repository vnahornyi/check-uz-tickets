export interface User {
    id: string;
    username: string;
    links: TrackingLink[];
}

export interface TrackingLink {
    id: string;
    url: string;
    createdAt: Date;
}

export interface Notification {
    userId: string;
    message: string;
    timestamp: Date;
}