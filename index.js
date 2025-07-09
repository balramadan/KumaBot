require("dotenv").config();
import { Client, GateawayIntentBits } from "discord.js";
import { SessionsClient } from "@google-cloud/dialogflow-cx";
import path from "path";

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
const COOLDOWN_SECONDS = 10;

// Insialisasi Klien
const sessionClient = new SessionsClient({
  keyFilename: keyFilePath,
});
const discordClient = new Client({
  intents: [
    GateawayIntentBits.Guilds,
    GateawayIntentBits.GuildMessages,
    GateawayIntentBits.MessageContent,
  ],
});

// Event handlers
discordClient.on("ready", () => {
  console.log(`🐾 Bot ${discordClient.user.tag} telah online`);
  console.log("🌐 Menghubungkan ke Dialogflow CX...");
  console.log(`🔗 Proyek: ${projectId}, Agen: ${agentId}, Lokasi: ${location}`);
});

discordClient.on("messageCreate", async (message) => {
  // Abaikan pesan dari bot lain
  if (message.author.bot) return;

  // Cek cooldown
  if (cooldowns.has(message.author.id)) {
    const expirationTime = cooldowns.get(message.author.id);
    if (Date.now() < expirationTime) {
      const timeLeft = ((expirationTime - Date.now()) / 1000).toFixed(1);
      message
        .reply(
          `⏱️ Anda terlalu cepat mengirim pesan. Coba lagi dalam ${timeLeft} detik.`
        )
        .then((msg) => {
          // Hapus pesan peringatan setelah beberapa detik
          setTimeout(() => msg.delete(), 4000);
        });
      // Hentikan eksekusi kode agar tidak memanggil Dialogflow
      return;
    }
  }

  //   Jika tidak cooldown, atur waktu cooldown baru untuk user ini
  cooldowns.set(message.author.id, Date.now() + COOLDOWN_SECONDS * 1000);

  // Kirim pesan pengguna ke Dialogflow CX
  try {
    const sessionId = message.author.id;
    const sessionPath = sessionClient.projectLocationAgentSessionPath(
      projectId,
      location,
      agentId,
      sessionId
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message.content,
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
      "Maaf 🐾, otak saya sedang mengalami sedikit gangguan. Coba lagi nanti."
    );
  }

  // --- Menjalankan Bot ---
  discordClient.login(discordToken);
});
