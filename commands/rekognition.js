/**
 * File: rekognition.js
 * Description: Advanced image analysis and face comparison using AWS Rekognition
 *
 * This command provides comprehensive image analysis capabilities including:
 * - Object and scene detection
 * - Text extraction (OCR)
 * - Face analysis with demographics and emotions
 * - Celebrity recognition
 * - Content moderation
 * - Face comparison between images
 *
 * Version: 1.0.0
 * Author: gl0bal01
 */

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const { promisify } = require('util');

const dnsLookup = promisify(dns.lookup);

// Import AWS SDK v3 modules
const {
    RekognitionClient,
    DetectLabelsCommand,
    DetectTextCommand,
    DetectFacesCommand,
    DetectModerationLabelsCommand,
    RecognizeCelebritiesCommand,
    CompareFacesCommand
} = require('@aws-sdk/client-rekognition');

// Lazy-initialized AWS Rekognition client (uses default credential provider chain)
let rekognitionClient = null;

function getRekognitionClient() {
    if (!rekognitionClient) {
        rekognitionClient = new RekognitionClient({
            region: process.env.AWS_REGION || 'us-east-1',
        });
    }
    return rekognitionClient;
}

// --- Per-user rate limiting ---
const cooldowns = new Map();
const COOLDOWN_MS = 5000;

// --- Image validation ---
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']);
const MAX_URL_LENGTH = 2048;
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_CONCURRENT_REQUESTS = 10; // Global concurrency limit
let activeRequests = 0;

function isValidImageBuffer(buffer) {
    if (!buffer || buffer.length < 12) return false;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
    // GIF: 47 49 46
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
    // BMP: 42 4D + valid file size in bytes 2-5 (little-endian, must be > 26 for minimal BMP header)
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        const fileSize = buffer.readUInt32LE(2);
        return fileSize > 26 && fileSize <= MAX_DOWNLOAD_BYTES;
    }
    // WebP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;

    return false;
}

// --- SSRF protection ---

function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p))) return true;

    return (
        parts[0] === 127 ||                                         // Loopback
        parts[0] === 10 ||                                          // 10.0.0.0/8
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||  // 172.16.0.0/12
        (parts[0] === 192 && parts[1] === 168) ||                   // 192.168.0.0/16
        (parts[0] === 169 && parts[1] === 254) ||                   // Link-local / AWS metadata
        parts[0] === 0 ||                                            // 0.0.0.0/8
        (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // Carrier-grade NAT
        (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19)     // Benchmarking
    );
}

function isPrivateIP(ip) {
    // IPv4
    if (!ip.includes(':')) return isPrivateIPv4(ip);

    // IPv6 loopback
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
    // IPv6 link-local, unique local
    if (ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true;
    // IPv4-mapped IPv6: ::ffff:x.x.x.x
    if (ip.startsWith('::ffff:')) {
        const v4 = ip.slice(7);
        if (net.isIPv4(v4)) return isPrivateIPv4(v4);
        return true; // Malformed — block
    }
    // IPv4-compatible IPv6 (deprecated): ::x.x.x.x
    if (ip.startsWith('::') && ip.includes('.')) {
        const v4 = ip.slice(2);
        if (net.isIPv4(v4)) return isPrivateIPv4(v4);
        return true;
    }
    // 6to4: 2002:XXYY:ZZWW:: encodes IPv4 XX.YY.ZZ.WW
    if (ip.startsWith('2002:')) {
        const hex = ip.split(':')[1];
        if (hex && hex.length <= 4) {
            const num = parseInt(hex, 16);
            const a = (num >> 8) & 0xFF;
            const b = num & 0xFF;
            const hex2 = ip.split(':')[2] || '0';
            const num2 = parseInt(hex2, 16);
            const c = (num2 >> 8) & 0xFF;
            const d = num2 & 0xFF;
            return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
        }
        return true;
    }
    // Teredo: 2001:0000:... (Teredo prefix)
    if (ip.startsWith('2001:0000:') || ip.startsWith('2001:0:')) return true;
    // :: (unspecified address, equivalent to 0.0.0.0)
    if (ip === '::') return true;

    return false;
}

async function validateAndResolveUrl(url) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Block direct IP addresses that are private (hostnames go through DNS check below)
    if (net.isIP(hostname) && isPrivateIP(hostname)) {
        throw new UserFacingError('URLs pointing to private or internal network addresses are not allowed.');
    }

    try {
        const { address, family } = await dnsLookup(hostname);
        if (isPrivateIP(address)) {
            throw new UserFacingError('URLs pointing to private or internal network addresses are not allowed.');
        }
        return { address, family };
    } catch (err) {
        if (err instanceof UserFacingError) throw err;
        throw new UserFacingError('Could not resolve the URL hostname.');
    }
}

// Pin resolved IP to prevent DNS rebinding between validation and request
function createPinnedAgent(protocol, address, family) {
    const Agent = protocol === 'https:' ? https.Agent : http.Agent;
    return new Agent({
        lookup: (_hostname, _options, cb) => cb(null, address, family)
    });
}

// --- Error types ---

class UserFacingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UserFacingError';
    }
}

// --- URL / extension helpers ---

function isValidUrl(url) {
    if (!url || url.length > MAX_URL_LENGTH) return false;
    try {
        const parsedUrl = new URL(url);
        return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch {
        return false;
    }
}

function escapeMarkdown(text) {
    return String(text).replace(/([*_`~|\\>])/g, '\\$1');
}

function sanitizeExtension(urlPathname) {
    const ext = path.extname(urlPathname).toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : '.jpg';
}

// --- Input validation (called before deferReply for ephemeral errors) ---

function validateAnalyzeInputs(interaction) {
    const imageUrl = interaction.options.getString('url');
    const uploadedImage = interaction.options.getAttachment('image');

    if (!imageUrl && !uploadedImage) {
        return '📷 **Input Required**\nPlease provide either an image URL or upload an image file.';
    }
    if (imageUrl && !isValidUrl(imageUrl)) {
        return '🔗 **Invalid URL**\nPlease provide a valid image URL (http:// or https://, max 2048 characters).';
    }
    return null;
}

function validateCompareInputs(interaction) {
    const sourceUrl = interaction.options.getString('source_url');
    const sourceAttachment = interaction.options.getAttachment('source_image');
    const targetUrl = interaction.options.getString('target_url');
    const targetAttachment = interaction.options.getAttachment('target_image');

    if (!sourceUrl && !sourceAttachment) {
        return '📷 **Source Image Required**\nPlease provide either a source image URL or upload a source image.';
    }
    if (!targetUrl && !targetAttachment) {
        return '📷 **Target Image Required**\nPlease provide either a target image URL or upload a target image.';
    }
    if (sourceUrl && !isValidUrl(sourceUrl)) {
        return '🔗 **Invalid Source URL**\nPlease provide a valid image URL (http:// or https://).';
    }
    if (targetUrl && !isValidUrl(targetUrl)) {
        return '🔗 **Invalid Target URL**\nPlease provide a valid image URL (http:// or https://).';
    }
    return null;
}

// --- Command definition ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rekognition')
        .setDescription('Analyze images and compare faces using AWS Rekognition')
        .addSubcommand(subcommand =>
            subcommand
                .setName('analyze')
                .setDescription('Comprehensive image analysis for objects, text, faces, and more')
                .addStringOption(option =>
                    option.setName('url')
                        .setDescription('URL of the image to analyze')
                        .setRequired(false))
                .addAttachmentOption(option =>
                    option.setName('image')
                        .setDescription('Upload an image to analyze')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('features')
                        .setDescription('Analysis features to run')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All Features (Recommended)', value: 'all' },
                            { name: 'Labels & Objects', value: 'labels' },
                            { name: 'Text Detection (OCR)', value: 'text' },
                            { name: 'Face Analysis', value: 'faces' },
                            { name: 'Content Moderation', value: 'moderation' },
                            { name: 'Celebrity Recognition', value: 'celebrities' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('compare')
                .setDescription('Compare faces between two images')
                .addStringOption(option =>
                    option.setName('source_url')
                        .setDescription('URL of the source image (reference face)')
                        .setRequired(false))
                .addAttachmentOption(option =>
                    option.setName('source_image')
                        .setDescription('Upload source image (reference face)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('target_url')
                        .setDescription('URL of the target image to compare')
                        .setRequired(false))
                .addAttachmentOption(option =>
                    option.setName('target_image')
                        .setDescription('Upload target image to compare')
                        .setRequired(false))
                .addNumberOption(option =>
                    option.setName('similarity')
                        .setDescription('Minimum similarity threshold (0-100, default: 80)')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(100)))
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
        .setDMPermission(false),

    // Exported for testing
    _test: { isPrivateIP, isPrivateIPv4, isValidImageBuffer, isValidUrl, sanitizeExtension, UserFacingError, createPinnedAgent, validateAndResolveUrl },

    async execute(interaction) {
        // Per-user rate limiting
        const userId = interaction.user.id;
        const now = Date.now();
        const lastUse = cooldowns.get(userId);
        if (lastUse && now - lastUse < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (now - lastUse)) / 1000);
            return interaction.reply({
                content: `⏳ Please wait ${remaining} second(s) before using this command again.`,
                ephemeral: true
            });
        }
        cooldowns.set(userId, now);

        // Prune stale cooldown entries periodically
        if (cooldowns.size > 100) {
            for (const [key, time] of cooldowns) {
                if (now - time > COOLDOWN_MS) cooldowns.delete(key);
            }
        }

        const subcommand = interaction.options.getSubcommand();

        // Validate inputs before deferring (allows ephemeral error responses)
        const validationError = subcommand === 'analyze'
            ? validateAnalyzeInputs(interaction)
            : validateCompareInputs(interaction);

        if (validationError) {
            return interaction.reply({ content: validationError, ephemeral: true });
        }

        // Global concurrency limit
        if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
            return interaction.reply({
                content: '⏳ The bot is currently processing too many requests. Please try again in a moment.',
                ephemeral: true
            });
        }
        activeRequests++;

        await interaction.deferReply();

        const tempDir = path.join(__dirname, '..', 'temp');
        const requestFiles = []; // Track files for per-request cleanup

        try {
            if (subcommand === 'analyze') {
                await handleAnalyze(interaction, tempDir, requestFiles);
            } else if (subcommand === 'compare') {
                await handleCompare(interaction, tempDir, requestFiles);
            }
        } catch (error) {
            console.error('Rekognition command error:', error);
            await handleError(interaction, error);
        } finally {
            activeRequests--;
            setTimeout(() => cleanupFiles(requestFiles), 10000);
        }
    },
};

// --- Subcommand handlers ---

async function handleAnalyze(interaction, tempDir, requestFiles) {
    const imageUrl = interaction.options.getString('url');
    const uploadedImage = interaction.options.getAttachment('image');
    const featureOption = interaction.options.getString('features') || 'all';

    let imageBuffer;
    let sourceDescription;
    let imageAttachment = null;

    if (uploadedImage) {
        const result = await processUploadedImage(uploadedImage, tempDir, '', requestFiles);
        imageBuffer = result.buffer;
        sourceDescription = result.description;
        imageAttachment = result.attachment;
    } else {
        const result = await processImageUrl(imageUrl, tempDir, '', requestFiles);
        imageBuffer = result.buffer;
        sourceDescription = result.description;
        imageAttachment = result.attachment;
    }

    const features = featureOption === 'all'
        ? ['labels', 'text', 'faces', 'moderation', 'celebrities']
        : [featureOption];

    await interaction.editReply(`🔍 **Analyzing Image**\nRunning ${features.length} analysis feature(s): ${features.join(', ')}...`);

    const results = await runAnalyses(imageBuffer, features);

    const reportPath = await createAnalysisReport(results, sourceDescription, tempDir, requestFiles);

    const embed = createAnalysisEmbed(results, sourceDescription, imageAttachment);

    const files = [new AttachmentBuilder(reportPath, { name: 'analysis_report.json' })];
    if (imageAttachment) files.push(imageAttachment);

    await interaction.editReply({
        content: '✅ **Analysis Complete!** Results are shown below with detailed JSON report attached.',
        embeds: [embed],
        files: files
    });
}

async function handleCompare(interaction, tempDir, requestFiles) {
    const sourceUrl = interaction.options.getString('source_url');
    const sourceAttachment = interaction.options.getAttachment('source_image');
    const targetUrl = interaction.options.getString('target_url');
    const targetAttachment = interaction.options.getAttachment('target_image');
    const similarityThreshold = interaction.options.getNumber('similarity') || 80;

    await interaction.editReply(`🔄 **Preparing Face Comparison**\nSimilarity threshold: ${similarityThreshold}%`);

    try {
        const sourceResult = sourceAttachment
            ? await processUploadedImage(sourceAttachment, tempDir, 'source', requestFiles)
            : await processImageUrl(sourceUrl, tempDir, 'source', requestFiles);

        const targetResult = targetAttachment
            ? await processUploadedImage(targetAttachment, tempDir, 'target', requestFiles)
            : await processImageUrl(targetUrl, tempDir, 'target', requestFiles);

        await interaction.editReply('🔍 **Comparing Faces**\nAnalyzing facial features and calculating similarity...');

        // Pass threshold directly — AWS expects 0-100, user input is already 0-100
        const comparisonResult = await compareFaces(
            sourceResult.buffer,
            targetResult.buffer,
            similarityThreshold
        );

        const reportPath = await createComparisonReport(
            comparisonResult, sourceResult.description, targetResult.description, tempDir, requestFiles
        );

        const embed = createComparisonEmbed(
            comparisonResult, sourceResult.description, targetResult.description, similarityThreshold
        );

        const files = [new AttachmentBuilder(reportPath, { name: 'comparison_report.json' })];
        if (sourceResult.attachment) files.push(sourceResult.attachment);
        if (targetResult.attachment) files.push(targetResult.attachment);

        await interaction.editReply({
            content: '✅ **Face Comparison Complete!** Results are shown below with detailed report attached.',
            embeds: [embed],
            files: files
        });

    } catch (error) {
        if (error.name === 'InvalidParameterException' && error.message?.includes('no face')) {
            return await interaction.editReply({
                content: '👤 **No Faces Detected**\nNo faces were found in one or both images. Please use images with clearly visible faces.'
            });
        }
        throw error;
    }
}

// --- Image processing ---

async function processUploadedImage(attachment, tempDir, prefix, requestFiles) {
    if (!attachment.contentType?.startsWith('image/')) {
        throw new UserFacingError('Invalid file type. Please upload a valid image file (JPEG, PNG, etc.).');
    }

    try {
        // Restrict attachment downloads to Discord CDN origin
        if (attachment.url && !attachment.url.startsWith('https://cdn.discordapp.com/')) {
            throw new UserFacingError('Attachment URL does not originate from Discord CDN.');
        }

        const response = await axios.get(attachment.url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: MAX_DOWNLOAD_BYTES,
            maxBodyLength: MAX_DOWNLOAD_BYTES,
            maxRedirects: 0 // No redirects from Discord CDN
        });

        const buffer = Buffer.from(response.data);

        if (!isValidImageBuffer(buffer)) {
            throw new UserFacingError('File does not appear to be a valid image. Supported formats: JPEG, PNG, GIF, BMP, WebP.');
        }

        // Sanitize filename: use random ID + validated extension only (prevents path traversal)
        const randomId = crypto.randomBytes(6).toString('hex');
        const origExt = path.extname(path.basename(attachment.name || '')).toLowerCase();
        const safeExt = ALLOWED_IMAGE_EXTENSIONS.has(origExt) ? origExt : '.jpg';
        const fileName = `${prefix ? prefix + '_' : ''}${randomId}${safeExt}`;
        const filePath = path.join(tempDir, fileName);

        await fsp.writeFile(filePath, buffer);
        requestFiles.push(filePath);

        return {
            buffer,
            description: `uploaded ${prefix ? prefix + ' ' : ''}image (${path.basename(attachment.name || 'image')})`,
            attachment: new AttachmentBuilder(filePath, {
                name: fileName,
                description: `${prefix ? prefix + ' ' : ''}Original image`
            })
        };
    } catch (error) {
        if (error instanceof UserFacingError) throw error;
        throw new UserFacingError('Failed to process uploaded image. Please try again.');
    }
}

async function processImageUrl(url, tempDir, prefix, requestFiles) {
    // SSRF protection: resolve hostname, block private IPs, pin resolved address
    const urlObj = new URL(url);
    const { address, family } = await validateAndResolveUrl(url);
    const agent = createPinnedAgent(urlObj.protocol, address, family);

    const fileExtension = sanitizeExtension(urlObj.pathname);
    const randomId = crypto.randomBytes(6).toString('hex');
    const fileName = `${prefix ? prefix + '_' : ''}image_${randomId}${fileExtension}`;
    const filePath = path.join(tempDir, fileName);

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: MAX_DOWNLOAD_BYTES,
            maxBodyLength: MAX_DOWNLOAD_BYTES,
            maxRedirects: 5,
            headers: { 'User-Agent': 'DiscordBot/1.0' },
            httpAgent: agent,
            httpsAgent: agent
        });

        if (!response.headers['content-type']?.startsWith('image/')) {
            throw new UserFacingError('URL does not point to a valid image.');
        }

        const buffer = Buffer.from(response.data);

        if (!isValidImageBuffer(buffer)) {
            throw new UserFacingError('Downloaded content is not a valid image. Supported formats: JPEG, PNG, GIF, BMP, WebP.');
        }

        await fsp.writeFile(filePath, buffer);
        requestFiles.push(filePath);

        return {
            buffer,
            description: url,
            attachment: new AttachmentBuilder(filePath, {
                name: fileName,
                description: `${prefix ? prefix + ' ' : ''}Image from URL`
            })
        };
    } catch (error) {
        if (error instanceof UserFacingError) throw error;
        if (error.code === 'ECONNABORTED') {
            throw new UserFacingError('Timeout while downloading image. Please try a different URL.');
        }
        throw new UserFacingError('Failed to download image. Please check the URL and try again.');
    }
}

// --- Analysis orchestration ---

async function runAnalyses(imageBuffer, features) {
    const results = {};
    const analyses = [];

    if (features.includes('labels')) {
        analyses.push(
            detectLabels(imageBuffer).then(data => results.labels = data).catch(() => results.labels = { error: 'Analysis failed' })
        );
    }

    if (features.includes('text')) {
        analyses.push(
            detectText(imageBuffer).then(data => results.text = data).catch(() => results.text = { error: 'Analysis failed' })
        );
    }

    if (features.includes('faces')) {
        analyses.push(
            detectFaces(imageBuffer).then(data => results.faces = data).catch(() => results.faces = { error: 'Analysis failed' })
        );
    }

    if (features.includes('moderation')) {
        analyses.push(
            detectModerationLabels(imageBuffer).then(data => results.moderation = data).catch(() => results.moderation = { error: 'Analysis failed' })
        );
    }

    if (features.includes('celebrities')) {
        analyses.push(
            recognizeCelebrities(imageBuffer).then(data => results.celebrities = data).catch(() => results.celebrities = { error: 'Analysis failed' })
        );
    }

    await Promise.all(analyses);
    return results;
}

// --- Embed builders ---

function createAnalysisEmbed(results, sourceDescription, imageAttachment) {
    const embed = new EmbedBuilder()
        .setTitle('🔍 AWS Rekognition Analysis')
        .setDescription(`**Image:** ${escapeMarkdown(sourceDescription)}`)
        .setColor(0xFF9900) // AWS orange
        .setTimestamp()
        .setFooter({ text: 'Powered by AWS Rekognition' });

    if (imageAttachment) {
        embed.setThumbnail(`attachment://${imageAttachment.name}`);
    }

    if (results.labels?.Labels) {
        const topLabels = results.labels.Labels
            .sort((a, b) => b.Confidence - a.Confidence)
            .slice(0, 8)
            .map(label => `• ${label.Name} (${label.Confidence.toFixed(1)}%)`)
            .join('\n');

        embed.addFields({
            name: '🏷️ Objects & Scenes',
            value: topLabels || 'No labels detected',
            inline: true
        });
    }

    if (results.text?.TextDetections) {
        const allLines = results.text.TextDetections.filter(text => text.Type === 'LINE');
        let textLines = allLines
            .slice(0, 5)
            .map(text => `• ${text.DetectedText}`)
            .join('\n');

        if (textLines.length > 1020) {
            const cutoff = textLines.lastIndexOf('\n', 1017);
            textLines = textLines.slice(0, cutoff > 0 ? cutoff : 1017) + '\n...';
        } else if (allLines.length > 5) {
            textLines += '\n...';
        }

        embed.addFields({
            name: '📝 Detected Text',
            value: textLines || 'No text detected',
            inline: true
        });
    }

    if (results.faces?.FaceDetails?.length > 0) {
        const face = results.faces.FaceDetails[0];
        let faceInfo = [];

        if (face.Gender) faceInfo.push(`Gender: ${face.Gender.Value} (${face.Gender.Confidence.toFixed(1)}%)`);
        if (face.AgeRange) faceInfo.push(`Age: ${face.AgeRange.Low}-${face.AgeRange.High}`);
        if (face.Emotions?.length > 0) {
            const topEmotion = face.Emotions.sort((a, b) => b.Confidence - a.Confidence)[0];
            faceInfo.push(`Emotion: ${topEmotion.Type} (${topEmotion.Confidence.toFixed(1)}%)`);
        }

        embed.addFields({
            name: `👤 Faces (${results.faces.FaceDetails.length})`,
            value: faceInfo.join('\n') || 'Face detected',
            inline: false
        });
    }

    if (results.celebrities?.CelebrityFaces?.length > 0) {
        const celebs = results.celebrities.CelebrityFaces
            .slice(0, 3)
            .map(celeb => `• ${celeb.Name} (${celeb.MatchConfidence.toFixed(1)}%)`)
            .join('\n');

        embed.addFields({
            name: '🌟 Celebrities',
            value: celebs,
            inline: false
        });
    }

    if (results.moderation?.ModerationLabels?.length > 0) {
        const modLabels = results.moderation.ModerationLabels
            .slice(0, 5)
            .map(label => `• ${label.Name} (${label.Confidence.toFixed(1)}%)`)
            .join('\n');

        embed.addFields({
            name: '⚠️ Content Moderation',
            value: modLabels,
            inline: false
        });
    }

    return embed;
}

function createComparisonEmbed(comparisonResult, sourceDesc, targetDesc, threshold) {
    const embed = new EmbedBuilder()
        .setTitle('👥 Face Comparison Results')
        .setColor(0xFF9900)
        .setTimestamp()
        .setFooter({ text: 'Powered by AWS Rekognition' });

    const matches = comparisonResult.FaceMatches || [];
    const unmatched = comparisonResult.UnmatchedFaces || [];

    embed.setDescription(`**Similarity Threshold:** ${threshold}%\n**Source:** ${sourceDesc}\n**Target:** ${targetDesc}`);

    if (matches.length > 0) {
        const matchInfo = matches.map((match, i) =>
            `Match ${i + 1}: ${match.Similarity.toFixed(1)}% similarity`
        ).join('\n');

        embed.addFields({
            name: `✅ Matched Faces (${matches.length})`,
            value: matchInfo,
            inline: false
        });
    } else {
        embed.addFields({
            name: '❌ No Matches Found',
            value: `No faces matched above the ${threshold}% threshold.`,
            inline: false
        });
    }

    if (unmatched.length > 0) {
        embed.addFields({
            name: `ℹ️ Additional Faces (${unmatched.length})`,
            value: `${unmatched.length} faces in target image did not match.`,
            inline: false
        });
    }

    return embed;
}

// --- Report generation ---

async function createAnalysisReport(results, imageSource, tempDir, requestFiles) {
    const report = {
        meta: {
            timestamp: new Date().toISOString(),
            source: imageSource,
            analysisType: 'comprehensive_image_analysis'
        },
        results: results
    };

    const reportPath = path.join(tempDir, `analysis_${crypto.randomBytes(4).toString('hex')}.json`);
    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
    requestFiles.push(reportPath);
    return reportPath;
}

async function createComparisonReport(comparisonResult, sourceDesc, targetDesc, tempDir, requestFiles) {
    const report = {
        meta: {
            timestamp: new Date().toISOString(),
            source: sourceDesc,
            target: targetDesc,
            analysisType: 'face_comparison'
        },
        results: comparisonResult
    };

    const reportPath = path.join(tempDir, `comparison_${crypto.randomBytes(4).toString('hex')}.json`);
    await fsp.writeFile(reportPath, JSON.stringify(report, null, 2));
    requestFiles.push(reportPath);
    return reportPath;
}

// --- Error handling ---

async function handleError(interaction, error) {
    let message = '❌ **An error occurred while processing your request.** Please try again later.';

    if (error instanceof UserFacingError) {
        message = `❌ **Error:** ${error.message}`;
    } else if (error.name === 'InvalidImageFormatException') {
        message = '🖼️ **Invalid Image Format**\nPlease use JPEG or PNG format.';
    } else if (error.name === 'ImageTooLargeException') {
        message = '📏 **Image Too Large**\nMaximum size: 5MB for JPEG, 8MB for PNG.';
    } else if (error.name === 'AccessDeniedException') {
        message = '🔐 **Service Configuration Error**\nThe bot is not properly configured. Please contact the administrator.';
    }

    try {
        await interaction.editReply({ content: message });
    } catch (editError) {
        console.error('Failed to edit reply:', editError);
    }
}

// --- Per-request file cleanup (race-safe) ---

async function cleanupFiles(filePaths) {
    for (const filePath of filePaths) {
        try {
            await fsp.unlink(filePath);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error('Cleanup error:', err);
            }
        }
    }
}

// --- AWS Rekognition API functions ---

async function detectLabels(imageBuffer) {
    const command = new DetectLabelsCommand({
        Image: { Bytes: imageBuffer },
        MaxLabels: 50,
        MinConfidence: 70
    });
    return await getRekognitionClient().send(command);
}

async function detectText(imageBuffer) {
    const command = new DetectTextCommand({
        Image: { Bytes: imageBuffer }
    });
    return await getRekognitionClient().send(command);
}

async function detectFaces(imageBuffer) {
    const command = new DetectFacesCommand({
        Image: { Bytes: imageBuffer },
        Attributes: ['ALL']
    });
    return await getRekognitionClient().send(command);
}

async function detectModerationLabels(imageBuffer) {
    const command = new DetectModerationLabelsCommand({
        Image: { Bytes: imageBuffer },
        MinConfidence: 50
    });
    return await getRekognitionClient().send(command);
}

async function recognizeCelebrities(imageBuffer) {
    const command = new RecognizeCelebritiesCommand({
        Image: { Bytes: imageBuffer }
    });
    return await getRekognitionClient().send(command);
}

async function compareFaces(sourceBuffer, targetBuffer, threshold) {
    const command = new CompareFacesCommand({
        SourceImage: { Bytes: sourceBuffer },
        TargetImage: { Bytes: targetBuffer },
        SimilarityThreshold: threshold
    });
    return await getRekognitionClient().send(command);
}
