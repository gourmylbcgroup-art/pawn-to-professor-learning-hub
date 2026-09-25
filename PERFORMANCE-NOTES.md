# Performance notes for future growth

The Learning Hub itself is relatively light. The largest downloads are likely to be the individual HTML5 games and their images/audio.

For each game, prefer:

- compressed WebP/JPEG/PNG images appropriate to the content;
- lazy-loading sounds/images that are not needed on the first screen;
- one shared game-hosting Vercel project where practical;
- avoiding duplicate copies of large audio/image files;
- keeping the GitHub source repository private for paid games;
- Secure Launcher + Game Gate for paid access.

Do not optimize based only on fear of traffic. Use the System Health page plus Vercel/Supabase metrics to identify the real bottleneck first.
