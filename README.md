# 🎯 Discord Amazon Rekognition

<div align="center">

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14.16.3-blue.svg)](https://discord.js.org/)
[![AWS SDK](https://img.shields.io/badge/AWS_SDK-v3.667.0-orange.svg)](https://aws.amazon.com/sdk-for-javascript/)
[![DOI](https://zenodo.org/badge/1005680658.svg)](https://doi.org/10.5281/zenodo.15722656)
[![GitHub](https://img.shields.io/badge/GitHub-gl0bal01-181717?logo=github&logoColor=white)](https://github.com/gl0bal01)

[![AWS Rekognition](https://img.shields.io/badge/AWS-Rekognition-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/rekognition/)
[![Computer Vision](https://img.shields.io/badge/AI-Computer_Vision-purple?style=for-the-badge)](https://aws.amazon.com/rekognition/)
[![Face Detection](https://img.shields.io/badge/Feature-Face_Detection-blue?style=for-the-badge)](https://aws.amazon.com/rekognition/)
[![OCR](https://img.shields.io/badge/Feature-Text_Extraction-green?style=for-the-badge)](https://aws.amazon.com/rekognition/)

</div>

A Discord bot that integrates with AWS Rekognition to provide image analysis, face detection, text extraction, celebrity recognition, content moderation, and face comparison directly within Discord servers.

**This bot can be used in OSINT workflows that involve image analysis, such as object identification, text extraction, and face comparison.**

## 📸 Preview

<details>
<summary>Face comparison: ✅</summary>

![Face Detection](/assets/0.png)
</details>
<details>
<summary>Face comparison: ❌</summary>

![Face Detection](/assets/1.png)
</details>
<details>
<summary>Analysis results: celebrities</summary>

![Face Detection](/assets/2.png)
</details>
<details>
<summary>Analysis results: text</summary>

![Face Detection](/assets/3.png)
</details>


## 📝 Table of Contents

<details>
<summary>Click to expand</summary>

- [✨ Features](#-features)
- [🚀 Commands](#-commands)
- [📋 Prerequisites](#-prerequisites)
- [🛠️ Installation](#️-installation)
- [🔑 AWS Setup](#-aws-setup)
- [🔧 Discord Setup](#-discord-setup)
- [⚡ Running the Bot](#-running-the-bot)
- [🔗 Bot Invitation](#-bot-invitation)
- [📁 Project Structure](#-project-structure)
- [🎯 Usage Examples](#-usage-examples)
- [📈 Performance](#-performance)
- [🐛 Troubleshooting](#-troubleshooting)
- [🔧 Development](#-development)
- [📊 API Limits](#-api-limits)
- [🛡️ Security](#️-security)
- [🤝 Contributing](#-contributing)

</details>

## ✨ Features

### 🔍 **Comprehensive Image Analysis**
- **Object & Scene Detection**: Identify thousands of objects, scenes, and concepts
- **Text Extraction (OCR)**: Extract text from images with high accuracy
- **Face Analysis**: Detect faces with demographics, emotions, and facial attributes
- **Celebrity Recognition**: Identify famous people in images
- **Content Moderation**: Automatically detect inappropriate content
- **Face Comparison**: Compare faces between two images with similarity scoring

### 🎯 **Advanced Capabilities**
- **Batch Processing**: Analyze multiple features simultaneously
- **AWS-Powered**: Uses AWS Rekognition's machine learning models
- **Detailed Reports**: Export comprehensive JSON analysis reports
- **Image Support**: Works with URLs and uploaded images (JPEG, PNG)
- **Real-time Processing**: Fast analysis with progress indicators
- **Error Handling**: Robust error management with user-friendly messages

### 💡 **User Experience**
- **Slash Commands**: Modern Discord interface with autocomplete
- **Visual Results**: Rich embeds with thumbnails and organized data
- **File Attachments**: Detailed JSON reports for further analysis
- **Progress Updates**: Real-time status updates during processing
- **Smart Validation**: Input validation and helpful error messages

## 🚀 Commands

### `/rekognition analyze`
Perform comprehensive image analysis with multiple AI features.

**Options:**
- `url` (optional): Direct image URL to analyze
- `image` (optional): Upload an image file to analyze
- `features` (optional): Specific features to analyze

**Available Features:**
- **All Features** (Recommended): Run complete analysis
- **Labels & Objects**: Detect objects, scenes, and concepts
- **Text Detection (OCR)**: Extract text from images
- **Face Analysis**: Analyze faces, emotions, and demographics
- **Content Moderation**: Check for inappropriate content
- **Celebrity Recognition**: Identify famous people

**Example:**
```
/rekognition analyze image:[upload] features:All Features
/rekognition analyze url:https://example.com/image.jpg features:Face Analysis
```

### `/rekognition compare`
Compare faces between two images with similarity scoring.

**Options:**
- `source_url` / `source_image`: Reference image with the face to match
- `target_url` / `target_image`: Image to search for matching faces
- `similarity` (optional): Minimum similarity threshold (0-100, default: 80)

**Example:**
```
/rekognition compare source_image:[upload1] target_image:[upload2] similarity:75
/rekognition compare source_url:https://example.com/face1.jpg target_url:https://example.com/face2.jpg
```

## 📋 Prerequisites

- **Node.js** v18.0.0 or higher (or **Bun** v1.0+)
- **Docker** (optional, recommended for production)
- **Discord Application** and bot token
- **AWS Account** with Rekognition access
- **AWS IAM User** with appropriate permissions

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/gl0bal01/discord-amazon-rekognition.git
cd discord-amazon-rekognition
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Set Up Environment Variables
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_client_id_here
GUILD_ID=your_development_server_id_here

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_REGION=us-east-1
```

## 🔑 AWS Setup

### 1. Create AWS Account
Sign up at [aws.amazon.com](https://aws.amazon.com/) if you don't have an account.

### 2. Create IAM User
1. Go to **IAM Console** → **Users** → **Create User**
2. Choose "Programmatic access"
3. Create or attach a policy with these permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "rekognition:DetectLabels",
                "rekognition:DetectText",
                "rekognition:DetectFaces",
                "rekognition:DetectModerationLabels",
                "rekognition:RecognizeCelebrities",
                "rekognition:CompareFaces"
            ],
            "Resource": "*"
        }
    ]
}
```

### 3. Get Credentials
- Copy the **Access Key ID** and **Secret Access Key**
- Add them to your `.env` file

### 4. Choose AWS Region
Select the region closest to your users:
- `us-east-1` (N. Virginia) - Default
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)
- `ap-southeast-1` (Singapore)

## 🔧 Discord Setup

### 1. Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** and name your bot
3. Go to **"Bot"** section and create a bot
4. Copy the **Bot Token** to your `.env` file

### 2. Get Client ID
1. In the **"General Information"** section
2. Copy the **Application ID** (this is your Client ID)

### 3. Bot Permissions
Your bot needs these permissions:
- `Send Messages` (2048)
- `Use Slash Commands` (2147483648)
- `Attach Files` (32768)
- `Embed Links` (16384)

**Permission Integer**: `2147516160`

## ⚡ Running the Bot

### 1. Deploy Commands
```bash
# Development (instant deployment to test server)
bun run deploy

# Production (global deployment - takes up to 1 hour)
bun run deploy:global
```

### 2. Start the Bot
```bash
# Production
bun run start

# Development with auto-restart
bun run dev
```

### 3. Docker (Recommended for Production)
```bash
# Build
docker build -t rekognition-bot .

# Run
docker run -d \
  --name rekognition-bot \
  --read-only \
  --tmpfs /app/temp:rw,noexec,nosuid,size=100m \
  --memory=512m \
  --cpus=1.0 \
  --pids-limit=50 \
  --security-opt=no-new-privileges:true \
  --env-file .env \
  --restart unless-stopped \
  rekognition-bot
```

### 4. Verify Startup
Look for these startup messages:
```
✅ Loaded command: rekognition
📁 Created temporary files directory
🎯 Discord Amazon Rekognition Bot is ready!
📊 Logged in as: YourBotName#1234
```

## 🔗 Bot Invitation

Use this URL to invite your bot (replace `YOUR_CLIENT_ID`):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147516160&scope=bot%20applications.commands
```

**Required Permissions:**
- **Send Messages**: Respond to commands
- **Use Slash Commands**: Register slash commands
- **Attach Files**: Send analysis reports and images
- **Embed Links**: Display rich result embeds

## 📁 Project Structure

```
discord-amazon-rekognition/
├── commands/
│   └── rekognition.js     # Main Rekognition command
├── tests/
│   └── rekognition.test.js # Unit tests (bun test)
├── temp/                  # Temporary file storage (auto-created)
├── .dockerignore         # Docker build exclusions
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
├── deploy-commands.js    # Command deployment script
├── Dockerfile            # Multi-stage production container
├── index.js              # Main bot application
├── LICENSE               # MIT license
├── package.json          # Dependencies and scripts
└── README.md             # This documentation
```

## 🎯 Usage Examples

### Example 1: Comprehensive Image Analysis
```
/rekognition analyze
📎 Upload: family_photo.jpg
🎯 Features: All Features
```

**Results:**
- **Objects**: Person (99.5%), Clothing (95.2%), Smile (87.1%)
- **Text**: "Happy Birthday!" extracted from banner
- **Faces**: 3 faces detected with age ranges and emotions
- **JSON Report**: Detailed technical analysis attached

### Example 2: Face Comparison
```
/rekognition compare
📎 Source: person1.jpg
📎 Target: group_photo.jpg
📊 Similarity: 75%
```

**Results:**
- **Match Found**: 89.2% similarity detected
- **Additional Faces**: 4 unmatched faces in target image
- **Comparison Report**: Detailed matching data

### Example 3: Text Extraction (OCR)
```
/rekognition analyze
🔗 URL: https://example.com/document.jpg
🎯 Features: Text Detection (OCR)
```

**Results:**
- **Extracted Text**: All readable text from the image
- **Confidence Scores**: Accuracy ratings for each text element
- **Bounding Boxes**: Location data in JSON report

## 📈 Performance

| Metric | Value |
|--------|-------|
| **Analysis Speed** | Varies by image size, network latency, and AWS region |
| **Supported Formats** | JPEG, PNG |
| **Max Image Size** | 5MB (JPEG), 8MB (PNG) |
| **Accuracy** | Depends on feature and image quality; see [AWS Rekognition documentation](https://docs.aws.amazon.com/rekognition/latest/dg/limits.html) for details |
| **Concurrent Requests** | 10 (configurable) |


## 🐛 Troubleshooting

### Common Issues

#### ❌ "AWS credentials are not configured"
**Solution:**
- Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are in `.env`
- Check that credentials are valid
- Ensure IAM user has Rekognition permissions

#### ❌ "Invalid image format"
**Solution:**
- Use JPEG or PNG format only
- Ensure image file is not corrupted
- Check image size limits (5MB JPEG, 8MB PNG)

#### ❌ "No faces detected"
**Solution:**
- Ensure faces are clearly visible and well-lit
- Use higher resolution images
- Avoid heavily obscured or profile faces

#### ❌ Commands not appearing
**Solution:**
- Run `bun run deploy` to update commands
- Check `CLIENT_ID` is correct in `.env`
- Wait up to 1 hour for global command deployment

### Debug Mode

Enable detailed logging:
```env
NODE_ENV=development
```

### AWS Pricing

Monitor your usage at [AWS Billing Console](https://console.aws.amazon.com/billing/):
- **Free Tier**: 5,000 images/month for first 12 months
- **Standard Pricing**: $1-5 per 1,000 images (varies by feature)

## 📊 API Limits

### AWS Rekognition Limits
- **Rate Limits**: 50 TPS (transactions per second)
- **Image Size**: 5MB JPEG, 8MB PNG
- **Image Resolution**: Minimum 80 pixels for face detection
- **Concurrent Requests**: 50 per account

### Discord Limits
- **Message Size**: 2000 characters
- **File Upload**: 25MB (Discord Nitro: 100MB)
- **Embeds**: 25 fields per embed

## 🛡️ Security

### Data Privacy
- **No Image Storage**: Images are processed and immediately deleted
- **Temporary Files**: Auto-cleanup after 10 seconds per request
- **AWS Security**: All data encrypted in transit and at rest
- **No Logging**: Personal image data is never logged

### Security Hardening
- **SSRF Protection**: DNS resolution + private IP blocking (IPv4, IPv6, IPv4-mapped IPv6, 6to4, Teredo) with pinned HTTP agents to prevent DNS rebinding
- **Path Traversal Prevention**: Random filenames with extension allowlisting
- **Magic Bytes Validation**: File signatures verified (JPEG, PNG, GIF, BMP, WebP)
- **Rate Limiting**: Per-user cooldown + global concurrency limit
- **Error Sanitization**: Internal errors never exposed to users
- **Docker**: Runs as non-root, read-only filesystem, tini init, pinned base image

### Best Practices
- Use IAM roles (preferred) or static credentials with minimal permissions
- Deploy with Docker using the recommended `docker run` flags
- Regularly rotate access keys if using static credentials
- Monitor AWS CloudTrail logs
- Keep dependencies updated (`bun update`)

### Content Moderation
The bot includes automatic content moderation features to detect:
- Explicit content
- Suggestive content
- Violence
- Visually disturbing content

## 🔧 Development

### Adding New Features
1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add appropriate error handling
5. Update documentation
6. Submit a pull request

### AWS SDK v3 Usage
This bot uses AWS SDK v3 for better performance:
```javascript
const { RekognitionClient, DetectLabelsCommand } = require('@aws-sdk/client-rekognition');

const client = new RekognitionClient({ region: 'us-east-1' });
const command = new DetectLabelsCommand(params);
const response = await client.send(command);
```

### Testing
```bash
bun test
```

110 unit tests covering SSRF protection, magic bytes validation, URL validation, extension sanitization, and IPv6 edge cases.


## 🔗 Quick Links

| Resource | Link |
|----------|------|
| 📚 AWS Rekognition Docs | [AWS Documentation](https://docs.aws.amazon.com/rekognition/) |
| 🐛 Report Bug | [GitHub Issues](https://github.com/gl0bal01/discord-amazon-rekognition/issues/new?template=bug_report.md) |
| ✨ Request Feature | [Feature Request](https://github.com/gl0bal01/discord-amazon-rekognition/issues/new?template=feature_request.md) |
| 💬 Discord Support | [Join Server](https://discord.gg/your-invite) |
| 🔧 AWS Console | [AWS Management Console](https://console.aws.amazon.com/rekognition/) |


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🆘 Support

- Create an [issue](https://github.com/gl0bal01/discord-amazon-rekognition/issues) for bug reports
- Join our [Discord server](https://discord.gg/your-server) for support
- Check [AWS Rekognition documentation](https://docs.aws.amazon.com/rekognition/) for API questions
- Review [Discord.js guide](https://discordjs.guide/) for bot development help

## 🙏 Acknowledgments

- [AWS Rekognition](https://aws.amazon.com/rekognition/) - Cloud-based computer vision service
- [Discord.js](https://discord.js.org/) - Excellent Discord API library
- [Discord Developer Portal](https://discord.com/developers/) - Bot development platform
- [AWS SDK for JavaScript](https://aws.amazon.com/sdk-for-javascript/) - Official AWS SDK

---

<div align="center">

**Made for image analysis workflows**

[![GitHub](https://img.shields.io/badge/GitHub-gl0bal01-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/gl0bal01)
[![AWS](https://img.shields.io/badge/Powered_by-AWS_Rekognition-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/rekognition/)

## ⭐ Star this repo if you find it helpful!

*Want to contribute? We welcome PRs, bug reports, and feature requests!*

</div>
