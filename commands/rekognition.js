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

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

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

// Initialize AWS Rekognition client
const rekognitionClient = new RekognitionClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

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
                        .setMaxValue(100))),
    
    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            // Validate AWS credentials
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                return interaction.editReply({
                    content: '❌ **AWS Configuration Error**\\n' +
                            'AWS credentials are not configured. Please set the following environment variables:\\n' +
                            '• `AWS_ACCESS_KEY_ID`\\n' +
                            '• `AWS_SECRET_ACCESS_KEY`\\n' +
                            '• `AWS_REGION` (optional, defaults to us-east-1)',
                    ephemeral: true
                });
            }
            
            const subcommand = interaction.options.getSubcommand();
            
            // Create temp directory for file operations
            const tempDir = path.join(__dirname, '..', 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            if (subcommand === 'analyze') {
                await handleAnalyze(interaction, tempDir);
            } else if (subcommand === 'compare') {
                await handleCompare(interaction, tempDir);
            }
            
        } catch (error) {
            console.error('Rekognition command error:', error);
            await handleError(interaction, error);
        } finally {
            // Clean up temporary files
            setTimeout(() => cleanupTempFiles(), 10000); // Clean up after 10 seconds
        }
    },
};

/**
 * Handle image analysis subcommand
 */
async function handleAnalyze(interaction, tempDir) {
    const imageUrl = interaction.options.getString('url');
    const uploadedImage = interaction.options.getAttachment('image');
    const featureOption = interaction.options.getString('features') || 'all';
    
    // Validate input
    if (!imageUrl && !uploadedImage) {
        return await interaction.editReply({
            content: '📷 **Input Required**\\nPlease provide either an image URL or upload an image file.',
            ephemeral: true
        });
    }

    let imageBuffer;
    let sourceDescription;
    let imageAttachment = null;
    
    try {
        // Process image input
        if (uploadedImage) {
            const result = await processUploadedImage(uploadedImage, tempDir);
            imageBuffer = result.buffer;
            sourceDescription = result.description;
            imageAttachment = result.attachment;
        } else {
            const result = await processImageUrl(imageUrl, tempDir);
            imageBuffer = result.buffer;
            sourceDescription = result.description;
            imageAttachment = result.attachment;
        }
        
        // Determine analysis features
        const features = featureOption === 'all' 
            ? ['labels', 'text', 'faces', 'moderation', 'celebrities'] 
            : [featureOption];
        
        await interaction.editReply(`🔍 **Analyzing Image**\\nRunning ${features.length} analysis feature(s): ${features.join(', ')}...`);
        
        // Run analyses in parallel
        const results = await runAnalyses(imageBuffer, features);
        
        // Create analysis report
        const reportPath = await createAnalysisReport(results, sourceDescription, tempDir);
        
        // Generate response embed
        const embed = createAnalysisEmbed(results, sourceDescription, imageAttachment);
        
        // Send response with attachments
        const files = [new AttachmentBuilder(reportPath, { name: 'analysis_report.json' })];
        if (imageAttachment) files.push(imageAttachment);
        
        await interaction.editReply({
            content: '✅ **Analysis Complete!** Results are shown below with detailed JSON report attached.',
            embeds: [embed],
            files: files
        });
        
    } catch (error) {
        console.error('Analysis error:', error);
        throw error;
    }
}

/**
 * Handle face comparison subcommand
 */
async function handleCompare(interaction, tempDir) {
    const sourceUrl = interaction.options.getString('source_url');
    const sourceAttachment = interaction.options.getAttachment('source_image');
    const targetUrl = interaction.options.getString('target_url');
    const targetAttachment = interaction.options.getAttachment('target_image');
    const similarityThreshold = interaction.options.getNumber('similarity') || 80;
    
    // Validate inputs
    if (!sourceUrl && !sourceAttachment) {
        return await interaction.editReply({
            content: '📷 **Source Image Required**\\nPlease provide either a source image URL or upload a source image.',
            ephemeral: true
        });
    }
    
    if (!targetUrl && !targetAttachment) {
        return await interaction.editReply({
            content: '📷 **Target Image Required**\\nPlease provide either a target image URL or upload a target image.',
            ephemeral: true
        });
    }
    
    await interaction.editReply(`🔄 **Preparing Face Comparison**\\nSimilarity threshold: ${similarityThreshold}%`);
    
    try {
        // Process both images
        const sourceResult = sourceAttachment 
            ? await processUploadedImage(sourceAttachment, tempDir, 'source')
            : await processImageUrl(sourceUrl, tempDir, 'source');
            
        const targetResult = targetAttachment 
            ? await processUploadedImage(targetAttachment, tempDir, 'target')
            : await processImageUrl(targetUrl, tempDir, 'target');
        
        await interaction.editReply(`🔍 **Comparing Faces**\\nAnalyzing facial features and calculating similarity...`);
        
        // Perform face comparison
        const comparisonResult = await compareFaces(
            sourceResult.buffer, 
            targetResult.buffer, 
            similarityThreshold / 100
        );
        
        // Create comparison report
        const reportPath = await createComparisonReport(comparisonResult, sourceResult.description, targetResult.description, tempDir);
        
        // Generate response embed
        const embed = createComparisonEmbed(comparisonResult, sourceResult.description, targetResult.description, similarityThreshold);
        
        // Send response with attachments
        const files = [new AttachmentBuilder(reportPath, { name: 'comparison_report.json' })];
        if (sourceResult.attachment) files.push(sourceResult.attachment);
        if (targetResult.attachment) files.push(targetResult.attachment);
        
        await interaction.editReply({
            content: '✅ **Face Comparison Complete!** Results are shown below with detailed report attached.',
            embeds: [embed],
            files: files
        });
        
    } catch (error) {
        if (error.code === 'InvalidParameterException' && error.message.includes('no face')) {
            return await interaction.editReply({
                content: '👤 **No Faces Detected**\\nNo faces were found in one or both images. Please use images with clearly visible faces.'
            });
        }
        throw error;
    }
}

/**
 * Process uploaded image attachment
 */
async function processUploadedImage(attachment, tempDir, prefix = '') {
    if (!attachment.contentType?.startsWith('image/')) {
        throw new Error('Invalid file type. Please upload a valid image file (JPEG, PNG, etc.).');
    }
    
    try {
        const response = await axios.get(attachment.url, { 
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: 10 * 1024 * 1024 // 10MB limit
        });
        
        const buffer = Buffer.from(response.data);
        const fileName = `${prefix ? prefix + '_' : ''}${attachment.name}`;
        const filePath = path.join(tempDir, fileName);
        
        fs.writeFileSync(filePath, buffer);
        
        return {
            buffer: buffer,
            description: `uploaded ${prefix ? prefix + ' ' : ''}image (${attachment.name})`,
            attachment: new AttachmentBuilder(filePath, { 
                name: fileName,
                description: `${prefix ? prefix + ' ' : ''}Original image`
            })
        };
    } catch (error) {
        throw new Error(`Failed to process uploaded image: ${error.message}`);
    }
}

/**
 * Process image from URL
 */
async function processImageUrl(url, tempDir, prefix = '') {
    if (!isValidUrl(url)) {
        throw new Error('Invalid URL. Please provide a valid image URL starting with http:// or https://');
    }
    
    try {
        const urlObj = new URL(url);
        const fileExtension = path.extname(urlObj.pathname) || '.jpg';
        const randomId = crypto.randomBytes(6).toString('hex');
        const fileName = `${prefix ? prefix + '_' : ''}image_${randomId}${fileExtension}`;
        const filePath = path.join(tempDir, fileName);
        
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: 10 * 1024 * 1024 // 10MB limit
        });
        
        if (!response.headers['content-type']?.startsWith('image/')) {
            throw new Error(`URL does not point to an image (received: ${response.headers['content-type'] || 'unknown'})`);
        }
        
        const buffer = Buffer.from(response.data);
        fs.writeFileSync(filePath, buffer);
        
        return {
            buffer: buffer,
            description: url,
            attachment: new AttachmentBuilder(filePath, { 
                name: fileName,
                description: `${prefix ? prefix + ' ' : ''}Image from URL`
            })
        };
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            throw new Error('Timeout while downloading image. Please try a different URL.');
        }
        throw new Error(`Failed to download image: ${error.message}`);
    }
}

/**
 * Run multiple analyses in parallel
 */
async function runAnalyses(imageBuffer, features) {
    const results = {};
    const analyses = [];
    
    if (features.includes('labels')) {
        analyses.push(
            detectLabels(imageBuffer).then(data => results.labels = data).catch(err => results.labels = { error: err.message })
        );
    }
    
    if (features.includes('text')) {
        analyses.push(
            detectText(imageBuffer).then(data => results.text = data).catch(err => results.text = { error: err.message })
        );
    }
    
    if (features.includes('faces')) {
        analyses.push(
            detectFaces(imageBuffer).then(data => results.faces = data).catch(err => results.faces = { error: err.message })
        );
    }
    
    if (features.includes('moderation')) {
        analyses.push(
            detectModerationLabels(imageBuffer).then(data => results.moderation = data).catch(err => results.moderation = { error: err.message })
        );
    }
    
    if (features.includes('celebrities')) {
        analyses.push(
            recognizeCelebrities(imageBuffer).then(data => results.celebrities = data).catch(err => results.celebrities = { error: err.message })
        );
    }
    
    await Promise.all(analyses);
    return results;
}

/**
 * Create analysis embed for Discord
 */
function createAnalysisEmbed(results, sourceDescription, imageAttachment) {
    const embed = new EmbedBuilder()
        .setTitle('🔍 AWS Rekognition Analysis')
        .setDescription(`**Image:** ${sourceDescription}`)
        .setColor(0xFF9900) // AWS orange
        .setTimestamp()
        .setFooter({ text: 'Powered by AWS Rekognition' });
    
    if (imageAttachment) {
        embed.setThumbnail(`attachment://${imageAttachment.name}`);
    }
    
    // Add analysis results to embed
    if (results.labels?.Labels) {
        const topLabels = results.labels.Labels
            .sort((a, b) => b.Confidence - a.Confidence)
            .slice(0, 8)
            .map(label => `• ${label.Name} (${label.Confidence.toFixed(1)}%)`)
            .join('\\n');
        
        embed.addFields({ 
            name: '🏷️ Objects & Scenes', 
            value: topLabels || 'No labels detected',
            inline: true
        });
    }
    
    if (results.text?.TextDetections) {
        const textLines = results.text.TextDetections
            .filter(text => text.Type === 'LINE')
            .slice(0, 5)
            .map(text => `• ${text.DetectedText}`)
            .join('\\n')
            .substring(0, 1020) + (results.text.TextDetections.filter(t => t.Type === 'LINE').length > 5 ? '\\n...' : '');
        
        embed.addFields({ 
            name: '📝 Detected Text', 
            value: textLines || 'No text detected',
            inline: true
        });
    }
    
    if (results.faces?.FaceDetails?.length > 0) {
        const face = results.faces.FaceDetails[0]; // Show first face details
        let faceInfo = [];
        
        if (face.Gender) faceInfo.push(`Gender: ${face.Gender.Value} (${face.Gender.Confidence.toFixed(1)}%)`);
        if (face.AgeRange) faceInfo.push(`Age: ${face.AgeRange.Low}-${face.AgeRange.High}`);
        if (face.Emotions?.length > 0) {
            const topEmotion = face.Emotions.sort((a, b) => b.Confidence - a.Confidence)[0];
            faceInfo.push(`Emotion: ${topEmotion.Type} (${topEmotion.Confidence.toFixed(1)}%)`);
        }
        
        embed.addFields({ 
            name: `👤 Faces (${results.faces.FaceDetails.length})`, 
            value: faceInfo.join('\\n') || 'Face detected',
            inline: false
        });
    }
    
    if (results.celebrities?.CelebrityFaces?.length > 0) {
        const celebs = results.celebrities.CelebrityFaces
            .slice(0, 3)
            .map(celeb => `• ${celeb.Name} (${celeb.MatchConfidence.toFixed(1)}%)`)
            .join('\\n');
        
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
            .join('\\n');
        
        embed.addFields({ 
            name: '⚠️ Content Moderation', 
            value: modLabels,
            inline: false
        });
    }
    
    return embed;
}

/**
 * Create comparison embed for Discord
 */
function createComparisonEmbed(comparisonResult, sourceDesc, targetDesc, threshold) {
    const embed = new EmbedBuilder()
        .setTitle('👥 Face Comparison Results')
        .setColor(0xFF9900)
        .setTimestamp()
        .setFooter({ text: 'Powered by AWS Rekognition' });
    
    const matches = comparisonResult.FaceMatches || [];
    const unmatched = comparisonResult.UnmatchedFaces || [];
    
    embed.setDescription(`**Similarity Threshold:** ${threshold}%\\n**Source:** ${sourceDesc}\\n**Target:** ${targetDesc}`);
    
    if (matches.length > 0) {
        const matchInfo = matches.map((match, i) => 
            `Match ${i + 1}: ${match.Similarity.toFixed(1)}% similarity`
        ).join('\\n');
        
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

/**
 * Create analysis report file
 */
async function createAnalysisReport(results, imageSource, tempDir) {
    const report = {
        meta: {
            timestamp: new Date().toISOString(),
            source: imageSource,
            analysisType: 'comprehensive_image_analysis'
        },
        results: results
    };
    
    const reportPath = path.join(tempDir, `analysis_${crypto.randomBytes(4).toString('hex')}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
}

/**
 * Create comparison report file
 */
async function createComparisonReport(comparisonResult, sourceDesc, targetDesc, tempDir) {
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
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
}

/**
 * Handle errors with user-friendly messages
 */
async function handleError(interaction, error) {
    let message = '❌ **An error occurred while processing your request.**';
    
    if (error.code === 'InvalidImageFormatException') {
        message = '🖼️ **Invalid Image Format**\\nPlease use JPEG or PNG format.';
    } else if (error.code === 'ImageTooLargeException') {
        message = '📏 **Image Too Large**\\nMaximum size: 5MB for JPEG, 8MB for PNG.';
    } else if (error.code === 'AccessDeniedException') {
        message = '🔐 **Access Denied**\\nPlease check your AWS credentials and permissions.';
    } else if (error.message) {
        message = `❌ **Error:** ${error.message}`;
    }
    
    try {
        await interaction.editReply({ content: message, ephemeral: true });
    } catch (editError) {
        console.error('Failed to edit reply:', editError);
    }
}

/**
 * Clean up temporary files
 */
function cleanupTempFiles() {
    try {
        const tempDir = path.join(__dirname, '..', 'temp');
        if (!fs.existsSync(tempDir)) return;
        
        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            const age = now - stats.mtime.getTime();
            
            // Delete files older than 1 minute
            if (age > 60000) {
                fs.unlinkSync(filePath);
            }
        });
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

/**
 * Validate URL format
 */
function isValidUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch {
        return false;
    }
}

// AWS Rekognition API Functions

async function detectLabels(imageBuffer) {
    const command = new DetectLabelsCommand({
        Image: { Bytes: imageBuffer },
        MaxLabels: 50,
        MinConfidence: 70
    });
    return await rekognitionClient.send(command);
}

async function detectText(imageBuffer) {
    const command = new DetectTextCommand({
        Image: { Bytes: imageBuffer }
    });
    return await rekognitionClient.send(command);
}

async function detectFaces(imageBuffer) {
    const command = new DetectFacesCommand({
        Image: { Bytes: imageBuffer },
        Attributes: ['ALL']
    });
    return await rekognitionClient.send(command);
}

async function detectModerationLabels(imageBuffer) {
    const command = new DetectModerationLabelsCommand({
        Image: { Bytes: imageBuffer },
        MinConfidence: 50
    });
    return await rekognitionClient.send(command);
}

async function recognizeCelebrities(imageBuffer) {
    const command = new RecognizeCelebritiesCommand({
        Image: { Bytes: imageBuffer }
    });
    return await rekognitionClient.send(command);
}

async function compareFaces(sourceBuffer, targetBuffer, threshold) {
    const command = new CompareFacesCommand({
        SourceImage: { Bytes: sourceBuffer },
        TargetImage: { Bytes: targetBuffer },
        SimilarityThreshold: threshold * 100
    });
    return await rekognitionClient.send(command);
}