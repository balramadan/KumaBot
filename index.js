require("dotenv").config();
// Mengimpor library yang diperlukan
const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
const { SessionsClient } = require("@google-cloud/dialogflow-cx");
const path = require("path");

const discordToken = process.env.DISCORD_TOKEN;
const projectId = process.env.GOOGLE_PROJECT_ID;
const agentId = process.env.GOOGLE_AGENT_ID;
const location = process.env.GOOGLE_LOCATION;
const keyFilename = process.env.GOOGLE_KEY_FILENAME;

// Memastikan semua konfigurasi ada
if (!discordToken || !projectId || !agentId || !location || !keyFilename) {
  console.error(
    "Error: Pastikan semua variabel di file .env sudah terisi dengan benar!"
  );
  process.exit(1);
}

const keyFilePath = path.join(__dirname, keyFilename);

// Sistem cooldown
const cooldowns = new Map();
const COOLDOWN_SECONDS = 30;

// Insialisasi Klien
let sessionClient;
let discordClient;

// Siapkan konfigurasi untuk klien Dialogflow
const clientConfig = {
  keyFilename: keyFilePath,
};

// Jika lokasi agen BUKAN 'global', kita harus tentukan endpoint API regionalnya
if (location !== "global") {
  clientConfig.apiEndpoint = `${location}-dialogflow.googleapis.com`;
}

try {
  sessionClient = new SessionsClient(clientConfig);
} catch (error) {
  console.error("--- [GAGAL] Inisialisasi Klien Dialogflow GAGAL:", error);
  process.exit(1);
}

try {
  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
} catch (error) {
  console.error("--- [GAGAL] Inisialisasi Klien Discord GAGAL:", error);
  process.exit(1);
}

// Event handlers
discordClient.on("ready", (c) => {
  console.log(`🐾 Bot ${discordClient.user.tag} telah online`);
  console.log("🌐 Menghubungkan ke Dialogflow CX...");
  console.log(`🔗 Proyek: ${projectId}, Agen: ${agentId}, Lokasi: ${location}`);

  c.user.setPresence({
    activities: [
      { name: "Tag @kuma to start the chat", type: ActivityType.Competing },
    ],
    status: "idle",
  });
});

discordClient.on("messageCreate", async (message) => {
  // Abaikan pesan dari bot lain
  if (message.author.bot) return;

  // Jika pesan ini tidak me-mention (tag) bot, hentikan proses.
  // Ini mencegah bot merespons setiap pesan di channel.
  if (!message.mentions.users.has(discordClient.user.id)) return;

  // --- LOGIKA COOLDOWN ---
  // Cek apakah pengguna sedang dalam masa cooldown
  if (cooldowns.has(message.author.id)) {
    const expirationTime = cooldowns.get(message.author.id);
    if (Date.now() < expirationTime) {
      const timeLeft = ((expirationTime - Date.now()) / 1000).toFixed(1);
      // Kirim pesan peringatan dan HENTIKAN eksekusi
      return message
        .reply(`⏱️ Anda terlalu cepat, coba lagi dalam ${timeLeft} detik.`)
        .then((msg) => setTimeout(() => msg.delete(), 4000));
    }
  }
  // Atur cooldown baru untuk pengguna ini setelah mereka berhasil mengirim pesan
  cooldowns.set(message.author.id, Date.now() + COOLDOWN_SECONDS * 1000);
  // --- AKHIR LOGIKA COOLDOWN ---

  try {
    const sessionId = message.author.id;
    const sessionPath = sessionClient.projectLocationAgentSessionPath(
      projectId,
      location,
      agentId,
      sessionId
    );

    // Kita bisa hapus tag dari isi pesan agar tidak mengganggu Dialogflow
    const contentWithoutMention = message.content.replace(/<@!?\d+>/g, '').trim();

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: contentWithoutMention || "halo",
        },
        languageCode: "id",
      },
    };

    const [response] = await sessionClient.detectIntent(request);

    const resultText = response.queryResult.responseMessages
      .map((msg) => msg.text.text.join(" "))
      .join("\n");

    if (resultText) {
      message.reply(resultText);
    }
  } catch (error) {
    console.error("Error saat berkomunikasi dengan Dialogflow:", error);
    message.reply(
      "Maaf, otak saya sedang mengalami sedikit gangguan. Coba lagi nanti."
    );
  }
});

// --- Menjalankan Bot ---
discordClient.login(discordToken).catch((error) => {
  console.error("--- [GAGAL] Proses login ke Discord GAGAL:", error);
  process.exit(1);
});
