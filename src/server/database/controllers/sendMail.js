
import nodemailer from 'nodemailer';
import { DEV_BUILD, HOST_NAME } from '../../config/config.js';
import { logEvents } from '../../middleware/logEvents.js';
import { getMemberDataByCriteria } from '../memberManager.js';

/**
 * Sends an account verification email to the specified member
 * @param {number} user_id
 */
function sendEmailConfirmation(user_id) {
	const EMAIL_USERNAME = process.env.EMAIL_USERNAME;
	const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD; // App password generated by google, instead of using our main password
	const host = DEV_BUILD ? `localhost:${process.env.HTTPSPORT_LOCAL}` : HOST_NAME;

	// eslint-disable-next-line prefer-const
	let { username, email, verification } = getMemberDataByCriteria(['username', 'email', 'verification'], 'user_id', user_id);
	if (username === undefined) return logEvents(`Unable to send email confirmation of non-existent member of id "${user_id}"!`, 'errLog.txt', { print: true });
	verification = JSON.parse(verification); // { verified, code }

	const url_string = `https://${host}/verify/${username.toLowerCase()}/${verification.code}`;
	const verificationUrl = new URL(url_string).toString();

	// Check if the email environment variables exist
	if (EMAIL_USERNAME === "" || EMAIL_APP_PASSWORD === "") {
		console.log("Email environment variables not specified. Not sending email. Click this link instead to verify:");
		console.log(verificationUrl);
		return;
	}

	const transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user: EMAIL_USERNAME,
			pass: EMAIL_APP_PASSWORD
		}
		// Enable if getting self signed certificate in certificate chain error.
		// Only useful in a development/testing environment.
		// , tls: {
		//     rejectUnauthorized: false
		// }
	});


	const mailOptions = {
		from: `Infinite Chess <${process.env.EMAIL_USERNAME}>`,
		to: email,
		subject: 'Verify your account',
		text: `
        Welcome to InfiniteChess.org!
    
        Thank you, ${username}, for creating an account. Please verify your account by visiting the following link:
    
        ${verificationUrl}
    
        If the link doesn't work, you can copy and paste the URL into your browser.
    
        If this wasn't you, please ignore this email.
        `,
		html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #999; border-radius: 5px;">
            <h2 style="color: #333;">Welcome to InfiniteChess.org!</h2>
            <p style="font-size: 16px; color: #555;">Thank you, <strong>${username}</strong>, for creating an account. Please click the button below to verify your account:</p>
            
            <a href="${verificationUrl}" style="font-size: 16px; background-color: #fff; color: black; padding: 10px 20px; text-decoration: none; border: 1px solid black; border-radius: 6px; display: inline-block; margin: 20px 0;">Verify Account</a>
            
            <p style="font-size: 16px; color: #555;">If the link doesn't work, you can copy and paste the following URL into your browser:</p>
            <p style="font-size: 14px; color: #666; word-wrap: break-word;"><a href="${verificationUrl}" style="color: #007BFF; text-decoration: underline;">${verificationUrl}</a></p>

            <p style="font-size: 16px; color: #777;">If this wasn't you, please ignore this email or reply to let us know.</p>
        </div>
        `
	};

	transporter.sendMail(mailOptions, function (err, info) {
		if (err) logEvents(`Error when sending verification email: ${err.stack}`, 'errLog.txt', { print: true });
		else console.log(`Email is sent to member ${username} of ID ${user_id}!`);
	});
};



/**
 * API to resent the verification email. 
 * Fetch sent by script on member page.
 * @param {object} req 
 * @param {object} res 
 */
function requestConfirmEmail(req, res) {
	if (req.memberInfo === undefined) {
		logEvents("req.memberInfo needs to be defined before handling confirmation email request route!", 'errLog.txt', { print: true }));
		return res.status(500).json({ message: 'Internal Server Error' });
	}

	if (!req.memberInfo.signedIn) {
		logEvents("User tried to resend the account verification email when they're not signed in! Their page should have auto-refreshed.", 'errLog.txt', { print: true });
		return res.status(401).json({ message: "Not signed in. Can't resent verification email." });
	}

	const username = req.params.member;

	// Check to make sure they are the person they are requesting the email for, then resend it!

	if (req.memberInfo.username.toLowerCase() === username.toLowerCase()) { // Same person

		const user_id = req.memberInfo.user_id;
		const { verification } = getMemberDataByCriteria(['verification'], 'user_id', user_id);
		if (verification === undefined) {
			logEvents(`Could not find member "${req.memberInfo.username}" of ID "${user_id}" when requesting confirmation email! This should never happen.`, 'errLog.txt', { print: true });
			return res.status(500).json({ message: 'Server error. Member not found.', sent: false });
		}

		// ONLY send email if they haven't already verified!
		if (verification === null || verification.verified) {
			const hackText = `Member "${username}"of ID "${user_id}" tried requesting another verification email after they've already verified!`;
			logEvents(hackText, 'hackLog.txt', { print: true });
			return res.status(401).json({ sent: false });
		}

		// SEND EMAIL CONFIRMATION
		sendEmailConfirmation(user_id);

		return res.json({ sent: true });
	} else { // Wrong person
		const errText = `Member ${req.memberInfo.username} of ID "${user_id}" attempted to send verification email for user ${username}!`;
		logEvents(errText, 'hackLog.txt', { print: true });
		return res.status(401).json({ sent: false });
	}
};



export {
	sendEmailConfirmation,
	requestConfirmEmail,
};
