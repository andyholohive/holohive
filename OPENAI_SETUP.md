# 🤖 OpenAI Integration Setup

Your KOL Campaign Manager now supports real AI responses using GPT-3.5-turbo!

## 🚀 Quick Setup

### 1. Get Your OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy your API key

### 2. Add API Key to Environment
Create a `.env.local` file in your project root and add:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here
```

**Replace `your_openai_api_key_here` with your actual API key**

### 3. Restart Your Development Server
```bash
npm run dev
```

## 💰 Cost Information

- **Model**: GPT-3.5-turbo (most cost-effective)
- **Input cost**: $0.0015 per 1K tokens
- **Output cost**: $0.002 per 1K tokens
- **Estimated monthly cost**: $5-20 for moderate usage

## 🎯 Features Now Powered by AI

### ✅ Real AI Responses
- Natural conversations with context awareness
- Dynamic campaign suggestions
- Intelligent KOL recommendations
- Smart message template generation
- Predictive insights and analytics

### ✅ Fallback System
- If OpenAI API fails, falls back to mock responses
- No interruption to user experience
- Automatic error handling

### ✅ Cost Optimization
- Token usage monitoring
- Efficient context management
- Smart caching strategies

## 🔧 Configuration Options

### Environment Variables
```env
# Required
OPENAI_API_KEY=your_api_key

# Optional (for client-side access - less secure)
NEXT_PUBLIC_OPENAI_API_KEY=your_api_key
```

### Model Settings
- **Model**: `gpt-3.5-turbo`
- **Max Tokens**: 1000
- **Temperature**: 0.7 (balanced creativity)

## 📊 Usage Monitoring

The system logs token usage and costs to the console:
```
AI Usage: {
  tokens: { input: 150, output: 300, total: 450 },
  cost: 0.000825,
  model: 'gpt-3.5-turbo'
}
```

## 🛠️ Troubleshooting

### Common Issues

1. **"OpenAI API Error"**
   - Check your API key is correct
   - Verify you have credits in your OpenAI account
   - Check internet connection

2. **"Failed to get AI response"**
   - System will automatically fall back to mock responses
   - Check console for detailed error messages

3. **High costs**
   - Monitor token usage in console
   - Consider implementing caching
   - Review conversation lengths

### Support
- Check OpenAI's [API documentation](https://platform.openai.com/docs)
- Monitor your usage at [OpenAI Usage](https://platform.openai.com/usage)

## 🎉 You're Ready!

Once you've added your API key, your AI assistant will:
- Provide real, intelligent responses
- Generate contextual campaign suggestions
- Create personalized message templates
- Offer data-driven insights
- Learn from your usage patterns

The system maintains all existing functionality while adding powerful AI capabilities!
