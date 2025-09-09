const https = require('https');

// Function to extract profile photo URLs from X.com using pattern matching
async function extractProfilePhotoUrl(username) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'x.com',
      path: `/${username}/photo`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Look for profile image URLs using multiple patterns
        const patterns = [
          /https:\/\/pbs\.twimg\.com\/profile_images\/\d+\/[^"'\s]+_400x400\.(jpg|jpeg|png|webp)/g,
          /https:\/\/pbs\.twimg\.com\/profile_images\/\d+\/[^"'\s]+\.(jpg|jpeg|png|webp)/g,
          /"profile_image_url_https":"([^"]*pbs\.twimg\.com\/profile_images[^"]*)"/g,
          /<meta[^>]*property="og:image"[^>]*content="([^"]*pbs\.twimg\.com\/profile_images[^"]*)"[^>]*>/g
        ];
        
        for (const pattern of patterns) {
          const matches = data.match(pattern);
          if (matches && matches.length > 0) {
            let url = matches[0];
            // Clean up the URL if it's from a meta tag or JSON
            if (url.includes('content="')) {
              url = url.match(/content="([^"]+)"/)[1];
            }
            if (url.includes('"profile_image_url_https":"')) {
              url = url.match(/"profile_image_url_https":"([^"]+)"/)[1];
            }
            console.log(`Found URL for ${username}: ${url}`);
            resolve(url);
            return;
          }
        }
        
        console.log(`No profile photo URL found for ${username}`);
        resolve(null);
      });
    });
    
    req.on('error', (error) => {
      console.error(`Error fetching ${username}:`, error.message);
      resolve(null);
    });
    
    req.end();
  });
}

// Extract URLs for all users
async function main() {
  const users = ['0xndy', 'BoltXBT', '0xYano'];
  
  console.log('Extracting profile photo URLs...\n');
  
  for (const user of users) {
    console.log(`Checking ${user}...`);
    const url = await extractProfilePhotoUrl(user);
    if (url) {
      console.log(`✅ ${user}: ${url}`);
    } else {
      console.log(`❌ ${user}: No URL found`);
    }
    console.log('');
    
    // Add delay to be respectful
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

main().catch(console.error);
