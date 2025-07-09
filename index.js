console.log("--- [LANGKAH 1] Skrip dimulai.");

require("dotenv").config();
console.log("--- [LANGKAH 2] Modul dotenv sudah dimuat.");
// Mengimpor library yang diperlukan
const { Client, GatewayIntentBits } = require("discord.js");
const { SessionsClient } = require("@google-cloud/dialogflow-cx");
const path = require("path");
console.log("--- [LANGKAH 3] Semua modul utama sudah diimpor.");

const discordToken = process.env.DISCORD_TOKEN;
const projectId = process.env.GOOGLE_PROJECT_ID;
const agentId = process.env.GOOGLE_AGENT_ID;
const location = process.env.GOOGLE_LOCATION;
const keyFilename = process.env.GOOGLE_KEY_FILENAME;

// Log untuk verifikasi variabel .env
console.log("--- [LANGKAH 4] Membaca variabel dari .env:");
console.log(
  `    > DISCORD_TOKEN DITEMUKAN: ${
    discordToken ? `Ya, Panjang: ${discordToken.length}` : "Tidak!"
  }`
);
console.log(`    > GOOGLE_PROJECT_ID: ${projectId || "Kosong!"}`);
console.log(`    > GOOGLE_AGENT_ID: ${agentId || "Kosong!"}`);
console.log(`    > GOOGLE_LOCATION: ${location || "Kosong!"}`);
console.log(`    > GOOGLE_KEY_FILENAME: ${keyFilename || "Kosong!"}`);

// Memastikan semua konfigurasi ada
if (!discordToken || !projectId || !agentId || !location || !keyFilename) {
  console.error(
    "Error: Pastikan semua variabel di file .env sudah terisi dengan benar!"
  );
  process.exit(1);
}
console.log("--- [LANGKAH 5] Validasi variabel berhasil.");

const keyFilePath = path.join(__dirname, keyFilename);
console.log(`--- [LANGKAH 6] Path file kunci Google diatur ke: ${keyFilePath}`);

// Sistem cooldown
const cooldowns = new Map();
const COOLDOWN_SECONDS = 10;

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
  console.log("--- [LANGKAH 7] Inisialisasi Klien Dialogflow BERHASIL.");
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
  console.log("--- [LANGKAH 8] Inisialisasi Klien Discord BERHASIL.");
} catch (error) {
  console.error("--- [GAGAL] Inisialisasi Klien Discord GAGAL:", error);
  process.exit(1);
}

// Event handlers
discordClient.on("ready", () => {
  console.log(`🐾 Bot ${discordClient.user.tag} telah online`);
  console.log("🌐 Menghubungkan ke Dialogflow CX...");
  console.log(`🔗 Proyek: ${projectId}, Agen: ${agentId}, Lokasi: ${location}`);
});

discordClient.on("messageCreate", async (message) => {
  // Abaikan pesan dari bot lain
  if (message.author.bot) return;

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
      "Maaf, otak saya sedang mengalami sedikit gangguan. Coba lagi nanti."
    );
  }
});

// --- Menjalankan Bot ---
console.log("--- [LANGKAH 9] Mencoba login ke Discord...");
discordClient.login(discordToken).catch((error) => {
  console.error("--- [GAGAL] Proses login ke Discord GAGAL:", error);
  process.exit(1);
});
