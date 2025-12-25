check-uz-tickets

A small Telegram bot and background worker that monitors booking.uz search pages for ticket availability and notifies users when tickets appear.

## Features

 Add and manage booking.uz search URLs to monitor (per Telegram user).
 Periodic scanning via Playwright (headless Chromium) run by a worker.
 Redis + Bull queue for notifications and worker triggers.
 PostgreSQL to persist users and tracked links; migrations supported via MikroORM.
 Per-link cooldown when a user marks a link "absent" to skip checks for a configurable period.

## Project Structure

```
check-uz-tickets
├── src
│   ├── bot
│   │   ├── index.ts                # Entry point for the Telegram bot
│   │   ├── commands
│   │   │   ├── addLink.ts          # Command to add a tracking link
│   │   │   ├── removeLink.ts       # Command to remove a tracking link
│   │   │   └── listLinks.ts        # Command to list all tracking links
│   │   └── notifications.ts         # Notification handling
│   ├── worker
│   │   └── worker.js                # Logic for tracking links
│   ├── db
│   │   ├── index.ts                 # Database operations
│   │   └── migrations
│   │       └── 001_create_tables.sql # Migration script for database tables
│   ├── queue
│   │   └── index.ts                 # Queue management
│   ├── redis
│   │   └── index.ts                 # Redis interactions
│   └── types
│       └── index.ts                 # TypeScript interfaces and types
├── package.json                      # npm configuration
├── tsconfig.json                    # TypeScript configuration
└── README.md                        # Project documentation
```

## Setup Instructions

1. Clone the repository:
   ```
   git clone https://github.com/vnahornyi/check-uz-tickets.git
   cd check-uz-tickets
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up the PostgreSQL database:
   - Create a database and update the connection settings in `src/db/index.ts`.
   - Run the migration script to create necessary tables:
     ```
     psql -U your_username -d your_database -f src/db/migrations/001_create_tables.sql
     ```

4. Configure the Telegram bot:
   - Create a new bot using BotFather on Telegram and obtain the bot token.
   - Update the bot token in `src/bot/index.ts`.

5. Start the bot:
   ```
   npm run start
   ```

## Usage

- Users can interact with the bot to add, remove, or list their tracking links.
- The bot will send notifications when tickets are found based on the tracking links provided.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.