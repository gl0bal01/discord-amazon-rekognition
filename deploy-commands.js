/**
 * Discord Amazon Rekognition Bot - Command Deployment Script
 * 
 * This script deploys slash commands to Discord.
 * Run this script whenever you add, modify, or remove commands.
 * 
 * Version: 1.0.0
 * Author: gl0bal01
 */

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];

// Load all command files from the commands directory
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('🔄 Loading commands for deployment...');

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`✅ Loaded command: ${command.data.name}`);
  } else {
    console.log(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
  }
}

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is required in environment variables!');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('❌ CLIENT_ID is required in environment variables!');
  process.exit(1);
}

// Initialize REST client
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
  try {
    console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);
    console.log('');

    const guildId = process.env.GUILD_ID;
    let data;

    if (guildId) {
      // Deploy to specific guild (instant deployment for development)
      console.log(`📍 Deploying commands to guild: ${guildId}`);
      console.log('⚡ Guild deployment is instant and great for testing!');
      
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands },
      );
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      console.log('🌍 Deploying commands globally...');
      console.log('⏰ Global deployment may take up to 1 hour to appear in all servers.');
      
      data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
    }

    console.log('');
    console.log(`✅ Successfully deployed ${data.length} application (/) commands!`);
    
    // List deployed commands
    console.log('');
    console.log('📋 Deployed commands:');
    data.forEach(command => {
      console.log(`   • /${command.name} - ${command.description}`);
    });
    
    console.log('');
    if (guildId) {
      console.log('🎯 Commands are now available in your development server!');
    } else {
      console.log('🌐 Commands will be available globally within 1 hour.');
    }
    
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
    
    if (error.code === 50001) {
      console.error('💡 Make sure your bot has the "applications.commands" scope!');
    } else if (error.code === 50013) {
      console.error('💡 The bot lacks permission to create commands in this guild.');
    } else if (error.status === 401) {
      console.error('💡 Invalid bot token. Check your DISCORD_TOKEN environment variable.');
    }
    
    process.exit(1);
  }
})();