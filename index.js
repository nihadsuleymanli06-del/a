const http = require('http');
const fs = require('fs');
const {
    Client: BotClient,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');

// ═══════════════════════════════════════════════════════════════
// HTTP Keep-Alive (Render vb. için)
// ═══════════════════════════════════════════════════════════════
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Discord bot is alive!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[HTTP] Server running on port ${PORT}`));

// ═══════════════════════════════════════════════════════════════
// Config (Environment Variables - Render)
// ═══════════════════════════════════════════════════════════════
const config = {
    botToken: process.env.BOT_TOKEN,
    adminId: process.env.ADMIN_ID
};

if (!config.botToken || !config.adminId) {
    console.error('[ERROR] BOT_TOKEN veya ADMIN_ID environment variable eksik!');
    console.error('Render → Environment kısmından ekle:');
    console.error('  BOT_TOKEN = bot tokenin');
    console.error('  ADMIN_ID  = discord idin');
    process.exit(1);
}

console.log(`[CONFIG] Admin ID: ${config.adminId}`);
console.log(`[CONFIG] Bot Token: ${config.botToken.substring(0, 20)}...`);

let database = { accounts: [] };
try {
    database = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
    if (!database.accounts) database.accounts = [];
} catch (e) {
    database = { accounts: [] };
    fs.writeFileSync('./database.json', JSON.stringify(database, null, 2));
}

function saveDatabase() {
    fs.writeFileSync('./database.json', JSON.stringify(database, null, 2));
}

function reloadDatabase() {
    try {
        database = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        if (!database.accounts) database.accounts = [];
    } catch (e) {
        database = { accounts: [] };
    }
}

// ═══════════════════════════════════════════════════════════════
// Selfbot Yönetimi
// ═══════════════════════════════════════════════════════════════
const selfClients = new Map(); // token -> { client, account, index }
const startTime = Date.now();

function getUptime() {
    const ms = Date.now() - startTime;
    const secs = Math.floor(ms / 1000) % 60;
    const mins = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000) % 24;
    const days = Math.floor(ms / 86400000);
    if (days > 0) return `${days}g ${hours}s ${mins}d`;
    if (hours > 0) return `${hours}s ${mins}d`;
    return `${mins}d ${secs}sn`;
}

async function connectSelfBot(account, index) {
    reloadDatabase();
    const freshAccount = database.accounts[index] || account;

    if (selfClients.has(freshAccount.token)) {
        console.log(`[SKIP] Zaten bağlı: ${freshAccount.username || 'Unknown'}`);
        return;
    }

    const client = new SelfClient({ checkUpdate: false });

    try {
        await client.login(freshAccount.token);
        freshAccount.username = client.user.tag;
        saveDatabase();

        selfClients.set(freshAccount.token, { client, account: freshAccount, index });
        console.log(`[CONNECT] ${client.user.tag}`);

        // Ses kanalına gir (mute + deaf)
        if (freshAccount.voiceChannelId) {
            try {
                const channel = await client.channels.fetch(freshAccount.voiceChannelId);
                if (channel) {
                    client.ws.broadcast({
                        op: 4,
                        d: {
                            guild_id: channel.guild.id,
                            channel_id: channel.id,
                            self_mute: true,
                            self_deaf: true,
                            self_video: false
                        }
                    });
                    console.log(`[VOICE] ${client.user.tag} → #${channel.name || freshAccount.voiceChannelId}`);
                }
            } catch (e) {
                console.log(`[VOICE ERROR] ${client.user.tag}: ${e.message}`);
            }
        }

        // Kanaldan atılırsa tekrar gir
        client.on('voiceStateUpdate', async (oldState, newState) => {
            if (oldState.member?.id === client.user.id && !newState.channelId && freshAccount.voiceChannelId) {
                console.log(`[REJOIN] ${freshAccount.username} kanaldan atıldı, yeniden bağlanıyor...`);
                setTimeout(async () => {
                    try {
                        const ch = await client.channels.fetch(freshAccount.voiceChannelId);
                        client.ws.broadcast({
                            op: 4,
                            d: {
                                guild_id: ch.guild.id,
                                channel_id: ch.id,
                                self_mute: true,
                                self_deaf: true,
                                self_video: false
                            }
                        });
                        console.log(`[VOICE] ${freshAccount.username} yeniden bağlandı`);
                    } catch (e) {
                        console.log(`[REJOIN ERROR] ${freshAccount.username}`);
                    }
                }, 5000);
            }
        });

    } catch (err) {
        console.log(`[ERROR] Token ${index + 1}: ${err.message}`);
    }
}

async function disconnectSelfBot(token) {
    const data = selfClients.get(token);
    if (data) {
        console.log(`[DISCONNECT] ${data.account.username || 'Bot'}`);
        try { data.client.destroy(); } catch (e) {}
        selfClients.delete(token);
    }
}

async function disconnectAll() {
    console.log('[STOP] Tüm hesaplar durduruluyor...');
    for (const [, data] of selfClients) {
        try { data.client.destroy(); } catch (e) {}
    }
    selfClients.clear();
    console.log('[STOP] Tüm hesaplar durduruldu');
}

async function startAllSelfBots() {
    console.log(`[START] ${database.accounts.length} hesap başlatılıyor...`);
    for (let i = 0; i < database.accounts.length; i++) {
        await connectSelfBot(database.accounts[i], i);
        await new Promise(r => setTimeout(r, 1500)); // rate limit
    }
}

async function restartAll() {
    await disconnectAll();
    await new Promise(r => setTimeout(r, 2000));
    await startAllSelfBots();
}

// ═══════════════════════════════════════════════════════════════
// Discord Bot
// ═══════════════════════════════════════════════════════════════
const bot = new BotClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

bot.once('ready', () => {
    console.log(`[BOT] ${bot.user.tag} olarak giriş yapıldı`);
    startAllSelfBots();
});

// ═══════════════════════════════════════════════════════════════
// Komutlar
// ═══════════════════════════════════════════════════════════════
bot.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Sadece admin kullanabilsin
    if (message.author.id !== config.adminId) {
        return message.reply('❌ Bu komutu sadece admin kullanabilir.');
    }

    if (command === 'panel') {
        const active = selfClients.size;
        const total = database.accounts.length;
        const offline = total - active;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🖥️ Token Yönetim Paneli')
            .setDescription(
                `🟢 **Online:** ${active}\n` +
                `🔴 **Offline:** ${offline}\n` +
                `📊 **Toplam:** ${total}\n` +
                `⏱️ **Uptime:** ${getUptime()}`
            )
            .setFooter({ text: 'Sadece token yönetimi' })
            .setTimestamp();

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_token').setLabel('Token Ekle').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('add_multi_token').setLabel('Toplu Token').setStyle(ButtonStyle.Primary).setEmoji('📦'),
            new ButtonBuilder().setCustomId('remove_token').setLabel('Token Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('restart_all').setLabel('Yeniden Başlat').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
            new ButtonBuilder().setCustomId('stop_all').setLabel('Durdur').setStyle(ButtonStyle.Danger).setEmoji('⏹️'),
            new ButtonBuilder().setCustomId('refresh').setLabel('Yenile').setStyle(ButtonStyle.Secondary).setEmoji('🔃')
        );

        await message.reply({ embeds: [embed], components: [row1, row2] });
    }

    if (command === 'status') {
        const active = selfClients.size;
        const total = database.accounts.length;
        let list = '';

        database.accounts.forEach((acc, i) => {
            const isOnline = selfClients.has(acc.token);
            list += `${isOnline ? '🟢' : '🔴'} **${acc.username || 'Unknown'}**\n`;
        });

        if (!list) list = '*Hiç hesap yok*';

        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`📊 Durum (${active}/${total})`)
            .setDescription(list)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
});

// ═══════════════════════════════════════════════════════════════
// Buton & Modal İşlemleri
// ═══════════════════════════════════════════════════════════════
bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    // Admin kontrolü
    if (interaction.user.id !== config.adminId) {
        return interaction.reply({ content: '❌ Yetkiniz yok.', ephemeral: true });
    }

    // ─── Butonlar ─────────────────────────────────────────────
    if (interaction.isButton()) {

        if (interaction.customId === 'add_token') {
            const modal = new ModalBuilder()
                .setCustomId('modal_add_token')
                .setTitle('Token Ekle')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('token_input')
                            .setLabel('Discord Token')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('channel_input')
                            .setLabel('Ses Kanal ID')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            await interaction.showModal(modal);
        }

        else if (interaction.customId === 'add_multi_token') {
            const modal = new ModalBuilder()
                .setCustomId('modal_add_multi_token')
                .setTitle('Toplu Token Ekle')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('tokens_input')
                            .setLabel('Tokenler (her satıra bir tane)')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('channel_input')
                            .setLabel('Ses Kanal ID')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            await interaction.showModal(modal);
        }

        else if (interaction.customId === 'remove_token') {
            if (database.accounts.length === 0) {
                return interaction.reply({ content: '❌ Silinecek hesap yok.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_remove_token')
                .setTitle('Token Sil')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('token_to_remove')
                            .setLabel('Token (ilk 20 karakter yeterli)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );
            await interaction.showModal(modal);
        }

        else if (interaction.customId === 'restart_all') {
            await interaction.reply({ content: '🔄 Tüm hesaplar yeniden başlatılıyor...', ephemeral: true });
            await restartAll();
            await interaction.editReply(`✅ Yeniden başlatıldı!\n🟢 Online: ${selfClients.size}/${database.accounts.length}`);
        }

        else if (interaction.customId === 'stop_all') {
            await interaction.reply({ content: '⏹️ Tüm hesaplar durduruluyor...', ephemeral: true });
            await disconnectAll();
            await interaction.editReply('✅ Tüm hesaplar durduruldu.');
        }

        else if (interaction.customId === 'refresh') {
            const active = selfClients.size;
            const total = database.accounts.length;

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🖥️ Token Yönetim Paneli')
                .setDescription(
                    `🟢 **Online:** ${active}\n` +
                    `🔴 **Offline:** ${total - active}\n` +
                    `📊 **Toplam:** ${total}\n` +
                    `⏱️ **Uptime:** ${getUptime()}`
                )
                .setFooter({ text: 'Sadece token yönetimi' })
                .setTimestamp();

            await interaction.update({ embeds: [embed] });
        }
    }

    // ─── Modal Submit ─────────────────────────────────────────
    if (interaction.isModalSubmit()) {

        if (interaction.customId === 'modal_add_token') {
            const token = interaction.fields.getTextInputValue('token_input').trim();
            const channelId = interaction.fields.getTextInputValue('channel_input').trim();

            if (database.accounts.find(a => a.token === token)) {
                return interaction.reply({ content: '❌ Bu token zaten ekli!', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // Token testi
            try {
                const testClient = new SelfClient({ checkUpdate: false });
                await testClient.login(token);
                const username = testClient.user.tag;
                testClient.destroy();

                database.accounts.push({
                    token,
                    voiceChannelId: channelId,
                    username,
                    addedBy: interaction.user.id
                });
                saveDatabase();

                const index = database.accounts.length - 1;
                connectSelfBot(database.accounts[index], index);

                await interaction.editReply(`✅ **Token eklendi!**\n👤 ${username}\n🔗 Kanal: ${channelId}`);
            } catch (err) {
                await interaction.editReply(`❌ Token geçersiz: ${err.message}`);
            }
        }

        else if (interaction.customId === 'modal_add_multi_token') {
            const tokensRaw = interaction.fields.getTextInputValue('tokens_input');
            const channelId = interaction.fields.getTextInputValue('channel_input').trim();
            const tokens = tokensRaw.split('\n').map(t => t.trim()).filter(t => t.length > 0);

            if (tokens.length === 0) {
                return interaction.reply({ content: '❌ Geçerli token bulunamadı!', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            let added = 0;
            for (const token of tokens) {
                if (database.accounts.find(a => a.token === token)) continue;

                database.accounts.push({
                    token,
                    voiceChannelId: channelId,
                    username: null,
                    addedBy: interaction.user.id
                });
                added++;
            }
            saveDatabase();

            // Bağlantıları başlat
            await startAllSelfBots();

            await interaction.editReply(`✅ **${added} token eklendi** ve bağlanmaya çalışılıyor.`);
        }

        else if (interaction.customId === 'modal_remove_token') {
            const partial = interaction.fields.getTextInputValue('token_to_remove').trim();
            const index = database.accounts.findIndex(acc => acc.token.startsWith(partial));

            if (index === -1) {
                return interaction.reply({ content: '❌ Token bulunamadı.', ephemeral: true });
            }

            const removed = database.accounts[index];
            await disconnectSelfBot(removed.token);
            database.accounts.splice(index, 1);
            saveDatabase();

            await interaction.reply({
                content: `✅ **Token silindi:** ${removed.username || 'Unknown'}`,
                ephemeral: true
            });
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// Kapanış
// ═══════════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
    console.log('\n[SHUTDOWN] Kapatılıyor...');
    await disconnectAll();
    bot.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (err) => {
    console.log(`[UNHANDLED] ${err.message || err}`);
});

bot.login(config.botToken);
